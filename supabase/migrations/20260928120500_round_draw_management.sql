alter table public.runs
  drop constraint runs_roping_division_id_run_number_draw_position_key;

alter table public.runs
  add constraint runs_roping_division_id_run_number_draw_position_key
  unique (roping_division_id, run_number, draw_position)
  deferrable initially immediate;

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
  target_organization_id uuid;
  target_event_status public.roping_status;
  target_round_count integer;
  drawn_count integer;
begin
  select division.organization_id, roping.status, division.number_of_runs
    into target_organization_id, target_event_status, target_round_count
  from public.roping_divisions division
  join public.ropings roping on roping.id = division.roping_id
  where division.id = target_roping_division_id;

  if target_organization_id is null
    or not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to generate this draw';
  end if;

  if target_event_status in ('completed', 'cancelled') then
    raise exception 'Draws cannot change after an event is completed or cancelled';
  end if;

  if target_run_number < 1 or target_run_number > target_round_count then
    raise exception 'Choose a valid round';
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
  target_organization_id uuid;
  target_event_status public.roping_status;
  target_round_count integer;
  expected_count integer;
  supplied_count integer;
  updated_count integer;
begin
  select division.organization_id, roping.status, division.number_of_runs
    into target_organization_id, target_event_status, target_round_count
  from public.roping_divisions division
  join public.ropings roping on roping.id = division.roping_id
  where division.id = target_roping_division_id;

  if target_organization_id is null
    or not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to update this draw';
  end if;

  if target_event_status in ('completed', 'cancelled') then
    raise exception 'Draws cannot change after an event is completed or cancelled';
  end if;

  if target_run_number < 1 or target_run_number > target_round_count then
    raise exception 'Choose a valid round';
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

create or replace function public.record_run_result_multi(
  target_run_id uuid,
  entered_timer_readings numeric[],
  entered_penalty numeric,
  entered_status public.run_status
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.runs%rowtype;
  division_record public.roping_divisions%rowtype;
  event_status public.roping_status;
  timer_index integer;
  resolved_time numeric(8, 3);
begin
  select * into run_record from public.runs where id = target_run_id;
  if run_record.id is null or not public.can_manage_organization(run_record.organization_id) then
    raise exception 'You do not have permission to record this run';
  end if;

  select * into division_record
  from public.roping_divisions
  where id = run_record.roping_division_id;

  select status into event_status
  from public.ropings
  where id = division_record.roping_id;

  if event_status <> 'in_progress' then
    raise exception 'Start the event before recording run results';
  end if;

  if run_record.draw_position is null then
    raise exception 'Generate and save the draw before recording run results';
  end if;

  if entered_status = 'complete' then
    if coalesce(array_length(entered_timer_readings, 1), 0) <> division_record.timer_count then
      raise exception 'Enter a reading from every configured timer';
    end if;
    if exists (
      select 1 from unnest(entered_timer_readings) reading
      where reading is null or reading < 0
    ) then
      raise exception 'Timer readings must be valid positive times';
    end if;
    if division_record.timer_resolution = 'best' then
      select min(reading) into resolved_time from unnest(entered_timer_readings) reading;
    elsif division_record.timer_resolution = 'longest' then
      select max(reading) into resolved_time from unnest(entered_timer_readings) reading;
    else
      select round(avg(reading), 3) into resolved_time from unnest(entered_timer_readings) reading;
    end if;
  end if;

  delete from public.run_timer_readings where run_id = target_run_id;
  if entered_status = 'complete' then
    for timer_index in 1..division_record.timer_count loop
      insert into public.run_timer_readings (
        organization_id, run_id, timer_number, time_seconds, entered_by
      ) values (
        run_record.organization_id, target_run_id, timer_index,
        entered_timer_readings[timer_index], auth.uid()
      );
    end loop;
  end if;

  update public.runs
  set raw_time_seconds = case when entered_status = 'complete' then resolved_time else null end,
      penalty_seconds = case when entered_status = 'complete' then coalesce(entered_penalty, 0) else 0 end,
      status = entered_status,
      recorded_by = auth.uid(),
      recorded_at = now()
  where id = target_run_id;

  return resolved_time;
end;
$$;

revoke all on function public.generate_division_draw(uuid, integer) from public;
grant execute on function public.generate_division_draw(uuid, integer) to authenticated;

revoke all on function public.set_division_draw_order(uuid, integer, uuid[]) from public;
grant execute on function public.set_division_draw_order(uuid, integer, uuid[]) to authenticated;

revoke all on function public.record_run_result_multi(
  uuid, numeric[], numeric, public.run_status
) from public;
grant execute on function public.record_run_result_multi(
  uuid, numeric[], numeric, public.run_status
) to authenticated;
