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

  if target_run_number > 1 and exists (
    select 1 from public.runs
    where roping_division_id = target_roping_division_id
      and run_number < target_run_number
      and status = 'pending'
  ) then
    raise exception 'Complete the earlier rounds before building this order';
  end if;

  set constraints runs_roping_division_id_run_number_draw_position_key deferred;

  with ordered as (
    select
      run.id,
      row_number() over (
        order by
          case when target_run_number = 1 then entry.entered_at end desc,
          case when target_run_number = 2 then previous_run.draw_position end desc nulls last,
          case when target_run_number >= 3 then prior_results.qualified_count end asc,
          case when target_run_number >= 3 then prior_results.aggregate_seconds end desc nulls first,
          entry.entered_at desc,
          run.id
      )::integer as position
    from public.runs run
    join public.entries entry on entry.id = run.entry_id
    left join public.runs previous_run
      on previous_run.entry_id = run.entry_id
     and previous_run.run_number = target_run_number - 1
    cross join lateral (
      select
        count(*) filter (where prior.status = 'complete')::integer as qualified_count,
        sum(greatest(
          prior.raw_time_seconds + prior.penalty_seconds - entry.incentive_adjustment_seconds,
          0
        )) filter (where prior.status = 'complete') as aggregate_seconds
      from public.runs prior
      where prior.entry_id = run.entry_id
        and prior.run_number < target_run_number
    ) prior_results
    where run.roping_division_id = target_roping_division_id
      and run.run_number = target_run_number
  )
  update public.runs run
  set draw_position = ordered.position
  from ordered
  where run.id = ordered.id;

  get diagnostics drawn_count = row_count;
  return drawn_count;
end;
$$;

revoke all on function public.generate_division_draw(uuid, integer) from public;
grant execute on function public.generate_division_draw(uuid, integer) to authenticated;
