create type public.round_order_method as enum (
  'reverse_first',
  'aggregate_slowest_to_fastest',
  'custom'
);

alter table public.division_templates
  add column second_round_ordering public.round_order_method not null
    default 'reverse_first',
  add column later_round_ordering public.round_order_method not null
    default 'aggregate_slowest_to_fastest';

alter table public.roping_divisions
  add column second_round_ordering public.round_order_method not null
    default 'reverse_first',
  add column later_round_ordering public.round_order_method not null
    default 'aggregate_slowest_to_fastest';

create function public.apply_division_round_ordering()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_template_id is not null then
    select second_round_ordering, later_round_ordering
      into new.second_round_ordering, new.later_round_ordering
    from public.division_templates
    where id = new.source_template_id
      and organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

create trigger roping_divisions_apply_round_ordering
before insert on public.roping_divisions
for each row execute function public.apply_division_round_ordering();

create function public.set_division_round_ordering(
  target_roping_division_id uuid,
  new_second_round_ordering public.round_order_method,
  new_later_round_ordering public.round_order_method
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  event_status public.roping_status;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to edit this class';
  end if;

  select status into event_status
  from public.ropings
  where id = division_record.roping_id;

  if event_status in ('in_progress', 'completed', 'cancelled') then
    raise exception 'Round ordering cannot change after the event has started';
  end if;

  update public.roping_divisions
  set second_round_ordering = new_second_round_ordering,
      later_round_ordering = new_later_round_ordering
  where id = division_record.id;
end;
$$;

revoke all on function public.set_division_round_ordering(
  uuid, public.round_order_method, public.round_order_method
) from public;
grant execute on function public.set_division_round_ordering(
  uuid, public.round_order_method, public.round_order_method
) to authenticated;

create or replace function public.generate_division_draw(
  target_roping_division_id uuid,
  target_run_number integer default 1
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  target_event_status public.roping_status;
  maximum_round_number integer;
  order_method public.round_order_method;
  candidate_run_ids uuid[];
  ordered_run_ids uuid[] := '{}'::uuid[];
  ordered_person_ids uuid[] := '{}'::uuid[];
  recent_person_ids uuid[] := '{}'::uuid[];
  selected_run_id uuid;
  selected_person_id uuid;
  drawn_count integer;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to generate this draw';
  end if;

  select status into target_event_status
  from public.ropings
  where id = division_record.roping_id;

  if target_event_status in ('completed', 'cancelled') then
    raise exception 'Draws cannot change after an event is completed or cancelled';
  end if;

  maximum_round_number := division_record.number_of_runs
    + case when division_record.short_round_enabled then 1 else 0 end;

  if target_run_number < 1 or target_run_number > maximum_round_number then
    raise exception 'Choose a valid round';
  end if;

  if target_run_number > division_record.number_of_runs
    and division_record.short_round_seeded_at is null then
    raise exception 'Build the short round from the main-round aggregate first';
  end if;

  if target_run_number > division_record.number_of_runs then
    raise exception 'Short round order is fixed from slowest aggregate to fastest';
  end if;

  if exists (
    select 1 from public.runs
    where roping_division_id = target_roping_division_id
      and run_number = target_run_number
      and status <> 'pending'
  ) then
    raise exception 'This draw is locked because results have already been entered';
  end if;

  if target_run_number > 1 and exists (
    select 1 from public.runs
    where roping_division_id = target_roping_division_id
      and run_number < target_run_number
      and status in ('pending', 'rerun')
  ) then
    raise exception 'Complete the earlier rounds before building this order';
  end if;

  order_method := case
    when target_run_number = 2 then division_record.second_round_ordering
    when target_run_number >= 3 then division_record.later_round_ordering
    else null
  end;

  select array_agg(
    run.id
    order by
      case when target_run_number = 1 then entry.entered_at end desc,
      case
        when target_run_number > 1 and order_method = 'reverse_first'
        then first_run.draw_position
      end desc nulls last,
      case
        when target_run_number > 1
          and order_method = 'aggregate_slowest_to_fastest'
        then prior_results.qualified_count
      end asc,
      case
        when target_run_number > 1
          and order_method = 'aggregate_slowest_to_fastest'
        then prior_results.aggregate_seconds
      end desc nulls first,
      case
        when target_run_number > 1 and order_method = 'custom'
        then run.draw_position
      end asc nulls last,
      entry.entered_at desc,
      run.id
  ) into candidate_run_ids
  from public.runs run
  join public.entries entry on entry.id = run.entry_id
  left join public.runs first_run
    on first_run.entry_id = run.entry_id
   and first_run.run_number = 1
  cross join lateral (
    select
      count(*) filter (where prior.status = 'complete')::integer
        as qualified_count,
      sum(greatest(
        prior.raw_time_seconds + prior.penalty_seconds
          - entry.incentive_adjustment_seconds,
        0
      )) filter (where prior.status = 'complete') as aggregate_seconds
    from public.runs prior
    where prior.entry_id = run.entry_id
      and prior.run_number < target_run_number
  ) prior_results
  where run.roping_division_id = target_roping_division_id
    and run.run_number = target_run_number;

  candidate_run_ids := coalesce(candidate_run_ids, '{}'::uuid[]);

  while cardinality(candidate_run_ids) > 0 loop
    selected_run_id := null;
    selected_person_id := null;

    if division_record.minimum_runs_between_entries > 0
      and cardinality(ordered_person_ids) > 0 then
      recent_person_ids := ordered_person_ids[
        greatest(
          cardinality(ordered_person_ids)
            - division_record.minimum_runs_between_entries
            + 1,
          1
        ):
        cardinality(ordered_person_ids)
      ];

      select candidate.run_id, entry.person_id
        into selected_run_id, selected_person_id
      from unnest(candidate_run_ids) with ordinality candidate(run_id, priority)
      join public.runs run on run.id = candidate.run_id
      join public.entries entry on entry.id = run.entry_id
      where not (entry.person_id = any(recent_person_ids))
      order by candidate.priority
      limit 1;
    end if;

    if selected_run_id is null then
      selected_run_id := candidate_run_ids[1];
      select entry.person_id into selected_person_id
      from public.runs run
      join public.entries entry on entry.id = run.entry_id
      where run.id = selected_run_id;
    end if;

    ordered_run_ids := array_append(ordered_run_ids, selected_run_id);
    ordered_person_ids := array_append(ordered_person_ids, selected_person_id);
    candidate_run_ids := array_remove(candidate_run_ids, selected_run_id);
  end loop;

  set constraints runs_roping_division_id_run_number_draw_position_key deferred;

  with ordered as (
    select run_id, position::integer
    from unnest(ordered_run_ids) with ordinality item(run_id, position)
  )
  update public.runs run
  set draw_position = ordered.position
  from ordered
  where run.id = ordered.run_id;

  get diagnostics drawn_count = row_count;
  return drawn_count;
end;
$$;

revoke all on function public.generate_division_draw(uuid, integer) from public;
grant execute on function public.generate_division_draw(uuid, integer)
to authenticated;
