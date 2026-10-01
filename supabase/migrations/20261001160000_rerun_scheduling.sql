create type public.rerun_timing as enum ('immediate', 'end_of_round');

alter table public.runs
  add column rerun_count integer not null default 0 check (rerun_count >= 0);

create table public.run_rerun_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  timing public.rerun_timing not null,
  reason text not null check (length(trim(reason)) >= 5),
  previous_draw_position integer not null,
  scheduled_draw_position integer not null,
  scheduled_by uuid references auth.users(id) on delete set null,
  scheduled_at timestamptz not null default now(),
  unique (run_id, attempt_number),
  foreign key (run_id, organization_id)
    references public.runs(id, organization_id) on delete cascade
);

create index run_rerun_history_run_idx
on public.run_rerun_history (run_id, attempt_number desc);

alter table public.run_rerun_history enable row level security;

create policy "Organization users can read rerun history"
on public.run_rerun_history for select
using (public.has_organization_access(organization_id));

create trigger audit_run_rerun_history
after insert or update or delete on public.run_rerun_history
for each row execute function public.write_audit_log();

create function public.schedule_run_rerun(
  target_run_id uuid,
  target_timing public.rerun_timing,
  entered_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_record public.runs%rowtype;
  division_record public.roping_divisions%rowtype;
  event_status public.roping_status;
  final_draw_position integer;
begin
  select * into run_record
  from public.runs
  where id = target_run_id
  for update;

  if run_record.id is null
    or not public.can_manage_organization(run_record.organization_id) then
    raise exception 'You do not have permission to schedule this rerun';
  end if;
  if run_record.status <> 'rerun' then
    raise exception 'This run is not waiting to be rescheduled';
  end if;
  if run_record.draw_position is null then
    raise exception 'This run does not have a draw position';
  end if;
  if length(trim(coalesce(entered_reason, ''))) < 5 then
    raise exception 'Enter a brief reason for this rerun';
  end if;

  select * into division_record
  from public.roping_divisions
  where id = run_record.roping_division_id;

  select status into event_status
  from public.ropings
  where id = division_record.roping_id;

  if event_status <> 'in_progress' then
    raise exception 'Reruns can only be scheduled while the event is in progress';
  end if;
  if exists (
    select 1 from public.roping_rounds round_control
    where round_control.roping_division_id = run_record.roping_division_id
      and round_control.run_number = run_record.run_number
      and round_control.status = 'locked'
  ) then
    raise exception 'This round is locked';
  end if;

  final_draw_position := run_record.draw_position;
  if target_timing = 'end_of_round' then
    select max(draw_position) into final_draw_position
    from public.runs
    where roping_division_id = run_record.roping_division_id
      and run_number = run_record.run_number;

    set constraints runs_roping_division_id_run_number_draw_position_key deferred;

    update public.runs
    set draw_position = draw_position - 1
    where roping_division_id = run_record.roping_division_id
      and run_number = run_record.run_number
      and draw_position > run_record.draw_position;
  end if;

  insert into public.run_rerun_history (
    organization_id,
    run_id,
    attempt_number,
    timing,
    reason,
    previous_draw_position,
    scheduled_draw_position,
    scheduled_by
  ) values (
    run_record.organization_id,
    run_record.id,
    run_record.rerun_count + 1,
    target_timing,
    trim(entered_reason),
    run_record.draw_position,
    final_draw_position,
    auth.uid()
  );

  update public.runs
  set status = 'pending',
      draw_position = final_draw_position,
      rerun_count = rerun_count + 1,
      raw_time_seconds = null,
      penalty_seconds = 0,
      recorded_by = null,
      recorded_at = null
  where id = run_record.id;

  return final_draw_position;
end;
$$;

revoke all on function public.schedule_run_rerun(
  uuid, public.rerun_timing, text
) from public;
grant execute on function public.schedule_run_rerun(
  uuid, public.rerun_timing, text
) to authenticated;
