create type public.timer_resolution_method as enum ('average', 'best', 'longest');

alter table public.runs
  add constraint runs_id_organization_unique unique (id, organization_id);

alter table public.division_templates
  add column timer_count integer not null default 1 check (timer_count between 1 and 10),
  add column timer_resolution public.timer_resolution_method not null default 'average';

alter table public.roping_divisions
  add column timer_count integer not null default 1 check (timer_count between 1 and 10),
  add column timer_resolution public.timer_resolution_method not null default 'average';

update public.roping_divisions division
set timer_count = template.timer_count,
    timer_resolution = template.timer_resolution
from public.division_templates template
where template.id = division.source_template_id;

create or replace function public.apply_division_timer_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_template_id is not null then
    select timer_count, timer_resolution
      into new.timer_count, new.timer_resolution
    from public.division_templates
    where id = new.source_template_id and organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

create trigger roping_divisions_apply_timer_settings
before insert on public.roping_divisions
for each row execute function public.apply_division_timer_settings();

create table public.run_timer_readings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null,
  timer_number integer not null check (timer_number > 0),
  time_seconds numeric(8, 3) not null check (time_seconds >= 0),
  entered_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, timer_number),
  foreign key (run_id, organization_id) references public.runs(id, organization_id) on delete cascade
);

create index run_timer_readings_run_idx on public.run_timer_readings (run_id, timer_number);
create trigger run_timer_readings_set_updated_at before update on public.run_timer_readings
for each row execute function public.set_updated_at();

alter table public.run_timer_readings enable row level security;
create policy "Organization users can read run timer readings"
on public.run_timer_readings for select
using (public.has_organization_access(organization_id));
create policy "Organization managers can insert run timer readings"
on public.run_timer_readings for insert
with check (public.can_manage_organization(organization_id));
create policy "Organization managers can update run timer readings"
on public.run_timer_readings for update
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));
create policy "Organization managers can delete run timer readings"
on public.run_timer_readings for delete
using (public.can_manage_organization(organization_id));

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
  timer_index integer;
  resolved_time numeric(8, 3);
begin
  select * into run_record from public.runs where id = target_run_id;
  if run_record.id is null or not public.can_manage_organization(run_record.organization_id) then
    raise exception 'You do not have permission to record this run';
  end if;
  select * into division_record from public.roping_divisions where id = run_record.roping_division_id;
  if entered_status = 'complete' then
    if coalesce(array_length(entered_timer_readings, 1), 0) <> division_record.timer_count then
      raise exception 'Enter a reading from every configured timer';
    end if;
    if exists (select 1 from unnest(entered_timer_readings) reading where reading is null or reading < 0) then
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
      insert into public.run_timer_readings (organization_id, run_id, timer_number, time_seconds, entered_by)
      values (run_record.organization_id, target_run_id, timer_index, entered_timer_readings[timer_index], auth.uid());
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

grant execute on function public.record_run_result_multi(uuid, numeric[], numeric, public.run_status) to authenticated;

create trigger audit_run_timer_readings after insert or update or delete on public.run_timer_readings
for each row execute function public.write_audit_log();
