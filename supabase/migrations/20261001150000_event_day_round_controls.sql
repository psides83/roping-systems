alter type public.run_status add value if not exists 'disqualified';
alter type public.run_status add value if not exists 'turned_out';

alter table public.runs
  add column correction_reason text,
  add column corrected_by uuid references auth.users(id) on delete set null,
  add column corrected_at timestamptz;

create table public.roping_rounds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  roping_division_id uuid not null,
  run_number integer not null check (run_number > 0),
  status text not null default 'open' check (status in ('open', 'locked')),
  locked_by uuid references auth.users(id) on delete set null,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (roping_division_id, run_number),
  foreign key (roping_division_id, organization_id)
    references public.roping_divisions(id, organization_id) on delete cascade
);

create index roping_rounds_division_idx
on public.roping_rounds (roping_division_id, run_number);

alter table public.roping_rounds enable row level security;

create policy "Organization users can read event rounds"
on public.roping_rounds for select
using (public.has_organization_access(organization_id));

create trigger roping_rounds_set_updated_at
before update on public.roping_rounds
for each row execute function public.set_updated_at();

create trigger audit_roping_rounds
after insert or update or delete on public.roping_rounds
for each row execute function public.write_audit_log();

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
  select * into run_record from public.runs where id = target_run_id for update;
  if run_record.id is null or not public.can_manage_organization(run_record.organization_id) then
    raise exception 'You do not have permission to record this run';
  end if;
  if run_record.status <> 'pending' then
    raise exception 'This run already has a result. Use the correction workflow to change it';
  end if;
  if entered_status = 'pending' then
    raise exception 'Choose a run outcome';
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
  if exists (
    select 1 from public.roping_rounds round_control
    where round_control.roping_division_id = run_record.roping_division_id
      and round_control.run_number = run_record.run_number
      and round_control.status = 'locked'
  ) then
    raise exception 'This round is locked. Use a correction with a reason';
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
      recorded_at = now(),
      correction_reason = null,
      corrected_by = null,
      corrected_at = null
  where id = target_run_id;

  return resolved_time;
end;
$$;

create function public.correct_run_result_multi(
  target_run_id uuid,
  entered_timer_readings numeric[],
  entered_penalty numeric,
  entered_status public.run_status,
  entered_reason text
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
  select * into run_record from public.runs where id = target_run_id for update;
  if run_record.id is null or not public.can_manage_organization(run_record.organization_id) then
    raise exception 'You do not have permission to correct this run';
  end if;
  if run_record.status = 'pending' then
    raise exception 'Record this run normally before using a correction';
  end if;
  if entered_status = 'pending' then
    raise exception 'Choose a run outcome';
  end if;
  if length(trim(coalesce(entered_reason, ''))) < 5 then
    raise exception 'Enter a brief reason for this correction';
  end if;

  select * into division_record
  from public.roping_divisions
  where id = run_record.roping_division_id;

  select status into event_status
  from public.ropings
  where id = division_record.roping_id;

  if event_status <> 'in_progress' then
    raise exception 'Corrections are only available while the event is in progress';
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
      correction_reason = trim(entered_reason),
      corrected_by = auth.uid(),
      corrected_at = now(),
      recorded_by = auth.uid(),
      recorded_at = now()
  where id = target_run_id;

  return resolved_time;
end;
$$;

create function public.complete_roping_round(
  target_roping_division_id uuid,
  target_run_number integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  event_status public.roping_status;
  maximum_round integer;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to complete this round';
  end if;

  select status into event_status
  from public.ropings
  where id = division_record.roping_id;
  if event_status <> 'in_progress' then
    raise exception 'The event must be in progress to complete a round';
  end if;

  maximum_round := division_record.number_of_runs
    + case when division_record.short_round_enabled then 1 else 0 end;
  if target_run_number < 1 or target_run_number > maximum_round then
    raise exception 'Choose a valid round';
  end if;
  if not exists (
    select 1 from public.runs
    where roping_division_id = target_roping_division_id
      and run_number = target_run_number
  ) then
    raise exception 'This round has no runs';
  end if;
  if exists (
    select 1 from public.runs
    where roping_division_id = target_roping_division_id
      and run_number = target_run_number
      and status in ('pending', 'rerun')
  ) then
    raise exception 'Resolve every pending run and required rerun before completing the round';
  end if;

  insert into public.roping_rounds (
    organization_id, roping_division_id, run_number,
    status, locked_by, locked_at
  ) values (
    division_record.organization_id, target_roping_division_id,
    target_run_number, 'locked', auth.uid(), now()
  )
  on conflict (roping_division_id, run_number) do update
  set status = 'locked', locked_by = auth.uid(), locked_at = now();
end;
$$;

revoke all on function public.correct_run_result_multi(
  uuid, numeric[], numeric, public.run_status, text
) from public;
grant execute on function public.correct_run_result_multi(
  uuid, numeric[], numeric, public.run_status, text
) to authenticated;

revoke all on function public.complete_roping_round(uuid, integer) from public;
grant execute on function public.complete_roping_round(uuid, integer) to authenticated;
