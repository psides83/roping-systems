alter table public.roping_divisions
  add column short_round_enabled boolean not null default false,
  add column short_round_seeded_at timestamptz;

create table public.roping_short_round_brackets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_division_id uuid not null,
  minimum_entries integer not null check (minimum_entries > 0),
  maximum_entries integer check (maximum_entries is null or maximum_entries >= minimum_entries),
  comeback_count integer not null check (comeback_count > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (roping_division_id, minimum_entries),
  unique (id, organization_id),
  foreign key (roping_division_id, organization_id)
    references public.roping_divisions(id, organization_id) on delete cascade
);

create index roping_short_round_brackets_division_idx
on public.roping_short_round_brackets (roping_division_id, minimum_entries);

create trigger roping_short_round_brackets_set_updated_at
before update on public.roping_short_round_brackets
for each row execute function public.set_updated_at();

create trigger audit_roping_short_round_brackets
after insert or update or delete on public.roping_short_round_brackets
for each row execute function public.write_audit_log();

alter table public.roping_short_round_brackets enable row level security;

create policy "Organization users can read short round brackets"
on public.roping_short_round_brackets for select
using (public.has_organization_access(organization_id));

create policy "Organization managers can insert short round brackets"
on public.roping_short_round_brackets for insert
with check (public.can_manage_organization(organization_id));

create policy "Organization managers can update short round brackets"
on public.roping_short_round_brackets for update
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy "Organization managers can delete short round brackets"
on public.roping_short_round_brackets for delete
using (public.can_manage_organization(organization_id));

create or replace function public.apply_short_round_settings(
  target_organization_id uuid,
  target_roping_division_id uuid,
  short_round_is_enabled boolean,
  short_round_brackets jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  bracket jsonb;
  bracket_index integer := 0;
  minimum_count integer;
  maximum_count integer;
  comeback_total integer;
begin
  if not exists (
    select 1 from public.roping_divisions
    where id = target_roping_division_id
      and organization_id = target_organization_id
  ) then
    raise exception 'That entry class is unavailable';
  end if;

  delete from public.roping_short_round_brackets
  where roping_division_id = target_roping_division_id;

  update public.roping_divisions
  set short_round_enabled = short_round_is_enabled,
      short_round_seeded_at = null
  where id = target_roping_division_id;

  if not short_round_is_enabled then
    return;
  end if;

  if jsonb_typeof(short_round_brackets) <> 'array'
    or jsonb_array_length(short_round_brackets) = 0 then
    raise exception 'Add at least one short round entry bracket';
  end if;

  for bracket in select * from jsonb_array_elements(short_round_brackets)
  loop
    bracket_index := bracket_index + 1;
    begin
      minimum_count := (bracket ->> 'minimumEntries')::integer;
      maximum_count := nullif(bracket ->> 'maximumEntries', '')::integer;
      comeback_total := (bracket ->> 'comebackCount')::integer;
    exception when others then
      raise exception 'Each short round bracket needs valid entry counts and a comeback count';
    end;

    if minimum_count < 1
      or (maximum_count is not null and maximum_count < minimum_count)
      or comeback_total < 1 then
      raise exception 'Short round bracket values must be positive and use a valid range';
    end if;

    insert into public.roping_short_round_brackets (
      organization_id,
      roping_division_id,
      minimum_entries,
      maximum_entries,
      comeback_count,
      sort_order
    ) values (
      target_organization_id,
      target_roping_division_id,
      minimum_count,
      maximum_count,
      comeback_total,
      bracket_index
    );
  end loop;

  if exists (
    select 1
    from public.roping_short_round_brackets first_bracket
    join public.roping_short_round_brackets second_bracket
      on second_bracket.roping_division_id = first_bracket.roping_division_id
     and second_bracket.id <> first_bracket.id
     and first_bracket.minimum_entries <= coalesce(second_bracket.maximum_entries, 2147483647)
     and second_bracket.minimum_entries <= coalesce(first_bracket.maximum_entries, 2147483647)
    where first_bracket.roping_division_id = target_roping_division_id
  ) then
    raise exception 'Short round entry brackets cannot overlap';
  end if;
end;
$$;

revoke all on function public.apply_short_round_settings(uuid, uuid, boolean, jsonb) from public;

create or replace function public.save_short_round_settings(
  target_roping_division_id uuid,
  short_round_is_enabled boolean,
  short_round_brackets jsonb
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
    raise exception 'You do not have permission to configure this short round';
  end if;

  select status into event_status
  from public.ropings
  where id = division_record.roping_id;

  if event_status in ('in_progress', 'completed', 'cancelled') then
    raise exception 'Short round settings cannot change after an event has started';
  end if;

  perform public.apply_short_round_settings(
    division_record.organization_id,
    division_record.id,
    short_round_is_enabled,
    short_round_brackets
  );
end;
$$;

revoke all on function public.save_short_round_settings(uuid, boolean, jsonb) from public;
grant execute on function public.save_short_round_settings(uuid, boolean, jsonb) to authenticated;

create or replace function public.create_roping_with_short_rounds(
  target_organization_id uuid,
  event_title text,
  event_slug text,
  event_venue_name text,
  event_address text,
  event_starts_at_local timestamp without time zone,
  event_entries_open_at_local timestamp without time zone,
  event_entries_close_at_local timestamp without time zone,
  event_is_public boolean,
  selected_division_template_ids uuid[],
  event_incentive_enabled boolean,
  event_incentive_rules jsonb,
  event_round_counts jsonb,
  event_short_round_enabled boolean,
  event_short_round_brackets jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_roping_id uuid;
  division_record record;
begin
  new_roping_id := public.create_roping_with_incentives(
    target_organization_id,
    event_title,
    event_slug,
    event_venue_name,
    event_address,
    event_starts_at_local,
    event_entries_open_at_local,
    event_entries_close_at_local,
    event_is_public,
    selected_division_template_ids,
    event_incentive_enabled,
    event_incentive_rules,
    event_round_counts
  );

  for division_record in
    select id from public.roping_divisions where roping_id = new_roping_id
  loop
    perform public.apply_short_round_settings(
      target_organization_id,
      division_record.id,
      event_short_round_enabled,
      event_short_round_brackets
    );
  end loop;

  return new_roping_id;
end;
$$;

grant execute on function public.create_roping_with_short_rounds(
  uuid, text, text, text, text, timestamp, timestamp, timestamp,
  boolean, uuid[], boolean, jsonb, jsonb, boolean, jsonb
) to authenticated;

revoke execute on function public.create_roping_with_incentives(
  uuid, text, text, text, text, timestamp, timestamp, timestamp,
  boolean, uuid[], boolean, jsonb, jsonb
) from authenticated;

create or replace function public.seed_short_round(target_roping_division_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  event_status public.roping_status;
  entry_total integer;
  comeback_total integer;
  seeded_total integer;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to build this short round';
  end if;

  if not division_record.short_round_enabled then
    raise exception 'This entry class does not have a short round';
  end if;

  select status into event_status
  from public.ropings
  where id = division_record.roping_id;

  if event_status <> 'in_progress' then
    raise exception 'Start the event before building the short round';
  end if;

  if exists (
    select 1 from public.runs
    where roping_division_id = target_roping_division_id
      and run_number <= division_record.number_of_runs
      and status = 'pending'
  ) then
    raise exception 'Complete every main-round run before building the short round';
  end if;

  if exists (
    select 1 from public.runs
    where roping_division_id = target_roping_division_id
      and run_number = division_record.number_of_runs + 1
      and status <> 'pending'
  ) then
    raise exception 'Short round results have already been entered';
  end if;

  select count(*)::integer into entry_total
  from public.entries
  where roping_division_id = target_roping_division_id;

  select comeback_count into comeback_total
  from public.roping_short_round_brackets
  where roping_division_id = target_roping_division_id
    and minimum_entries <= entry_total
    and (maximum_entries is null or maximum_entries >= entry_total)
  order by minimum_entries desc
  limit 1;

  if comeback_total is null then
    raise exception 'No short round bracket applies to % entries', entry_total;
  end if;

  delete from public.runs
  where roping_division_id = target_roping_division_id
    and run_number = division_record.number_of_runs + 1;

  with aggregates as (
    select
      run.entry_id,
      sum(greatest(
        run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds,
        0
      )) as aggregate_time,
      max(greatest(
        run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds,
        0
      )) filter (where run.run_number = division_record.number_of_runs) as last_round_time
    from public.runs run
    join public.entries entry on entry.id = run.entry_id
    where run.roping_division_id = target_roping_division_id
      and run.run_number <= division_record.number_of_runs
      and run.status = 'complete'
    group by run.entry_id
    having count(*) = division_record.number_of_runs
  ), qualifiers as (
    select *
    from aggregates
    order by aggregate_time, last_round_time, entry_id
    limit comeback_total
  ), ordered_qualifiers as (
    select
      entry_id,
      row_number() over (
        order by aggregate_time desc, last_round_time desc, entry_id
      )::integer as draw_position
    from qualifiers
  )
  insert into public.runs (
    organization_id,
    roping_division_id,
    entry_id,
    run_number,
    draw_position
  )
  select
    division_record.organization_id,
    division_record.id,
    qualifier.entry_id,
    division_record.number_of_runs + 1,
    qualifier.draw_position
  from ordered_qualifiers qualifier;

  get diagnostics seeded_total = row_count;

  update public.roping_divisions
  set short_round_seeded_at = now()
  where id = target_roping_division_id;

  return seeded_total;
end;
$$;

revoke all on function public.seed_short_round(uuid) from public;
grant execute on function public.seed_short_round(uuid) to authenticated;

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

  set constraints runs_roping_division_id_run_number_draw_position_key deferred;

  with randomized as (
    select id, row_number() over (order by random())::integer as position
    from public.runs
    where roping_division_id = target_roping_division_id
      and run_number = target_run_number
  )
  update public.runs run
  set draw_position = randomized.position
  from randomized
  where run.id = randomized.id;

  get diagnostics drawn_count = row_count;
  return drawn_count;
end;
$$;

create or replace function public.set_division_draw_order(
  target_roping_division_id uuid,
  target_run_number integer,
  ordered_run_ids uuid[]
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
  expected_count integer;
  supplied_count integer;
  updated_count integer;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to update this draw';
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

  select count(*)::integer into expected_count
  from public.runs
  where roping_division_id = target_roping_division_id
    and run_number = target_run_number;

  select count(distinct supplied.id)::integer into supplied_count
  from unnest(ordered_run_ids) as supplied(id)
  join public.runs run on run.id = supplied.id
  where run.roping_division_id = target_roping_division_id
    and run.run_number = target_run_number;

  if expected_count = 0
    or coalesce(array_length(ordered_run_ids, 1), 0) <> expected_count
    or supplied_count <> expected_count then
    raise exception 'The saved order must include every run in this round exactly once';
  end if;

  set constraints runs_roping_division_id_run_number_draw_position_key deferred;

  with desired as (
    select supplied.id, supplied.position::integer
    from unnest(ordered_run_ids) with ordinality as supplied(id, position)
  )
  update public.runs run
  set draw_position = desired.position
  from desired
  where run.id = desired.id
    and run.roping_division_id = target_roping_division_id
    and run.run_number = target_run_number;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function public.finalize_roping_results(target_roping_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
begin
  select organization_id into target_organization_id
  from public.ropings
  where id = target_roping_id;

  if target_organization_id is null
    or not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to finalize this event';
  end if;

  if exists (
    select 1
    from public.roping_divisions division
    where division.roping_id = target_roping_id
      and division.short_round_enabled = true
      and division.short_round_seeded_at is null
      and exists (
        select 1
        from public.roping_short_round_brackets bracket
        where bracket.roping_division_id = division.id
          and bracket.minimum_entries <= (
            select count(*) from public.entries entry
            where entry.roping_division_id = division.id
          )
          and (
            bracket.maximum_entries is null
            or bracket.maximum_entries >= (
              select count(*) from public.entries entry
              where entry.roping_division_id = division.id
            )
          )
      )
  ) then
    raise exception 'Build every configured short round before finalizing results';
  end if;

  if exists (
    select 1 from public.runs run
    join public.roping_divisions division on division.id = run.roping_division_id
    where division.roping_id = target_roping_id
      and run.status = 'pending'
  ) then
    raise exception 'Every scheduled run must be completed, scratched, or marked no-time before finalizing';
  end if;

  update public.roping_divisions
  set result_status = 'official'
  where roping_id = target_roping_id;

  update public.ropings
  set status = 'completed', result_status = 'official'
  where id = target_roping_id;
end;
$$;

grant execute on function public.generate_division_draw(uuid, integer) to authenticated;
grant execute on function public.set_division_draw_order(uuid, integer, uuid[]) to authenticated;
grant execute on function public.finalize_roping_results(uuid) to authenticated;

create view public.public_aggregate_results
with (security_invoker = false)
as
select
  entry.id as result_id,
  roping.organization_id,
  organization.slug as organization_slug,
  roping.slug as roping_slug,
  roping.title as roping_title,
  division.id as division_id,
  division.name as division_name,
  division.result_status,
  entry.entry_number,
  person.first_name,
  person.last_name,
  division.number_of_runs as main_round_count,
  main_results.completed_count as main_rounds_completed,
  case
    when main_results.disqualified then null
    else main_results.aggregate_time_seconds
  end as main_aggregate_seconds,
  (short_run.id is not null) as is_short_round_qualifier,
  short_run.status as short_round_status,
  case
    when short_run.status = 'complete' then greatest(
      short_run.raw_time_seconds + short_run.penalty_seconds - entry.incentive_adjustment_seconds,
      0
    )
    else null
  end as short_round_time_seconds,
  case
    when main_results.disqualified then null
    when short_run.status = 'complete' then
      main_results.aggregate_time_seconds + greatest(
        short_run.raw_time_seconds + short_run.penalty_seconds - entry.incentive_adjustment_seconds,
        0
      )
    else main_results.aggregate_time_seconds
  end as aggregate_time_seconds,
  case
    when main_results.disqualified then 'no_time'
    when short_run.status in ('no_time', 'scratch') then short_run.status::text
    when main_results.completed_count = division.number_of_runs then 'complete'
    else 'pending'
  end as status,
  entry.incentive_adjustment_seconds
from public.entries entry
join public.people person on person.id = entry.person_id
join public.roping_divisions division on division.id = entry.roping_division_id
join public.ropings roping on roping.id = division.roping_id
join public.organizations organization on organization.id = roping.organization_id
cross join lateral (
  select
    count(*) filter (where run.status = 'complete')::integer as completed_count,
    bool_or(run.status in ('no_time', 'scratch')) as disqualified,
    sum(
      greatest(
        run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds,
        0
      )
    ) filter (where run.status = 'complete') as aggregate_time_seconds,
    count(*) filter (where run.status <> 'pending')::integer as started_count
  from public.runs run
  where run.entry_id = entry.id
    and run.run_number <= division.number_of_runs
) main_results
left join public.runs short_run
  on short_run.entry_id = entry.id
 and short_run.run_number = division.number_of_runs + 1
where roping.is_public = true
  and main_results.started_count > 0;

revoke all on public.public_aggregate_results from public;
grant select on public.public_aggregate_results to anon, authenticated;
