create table public.event_contestant_check_ins (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null,
  person_id uuid not null references public.people(id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references auth.users(id) on delete set null,
  unique (roping_id, person_id),
  foreign key (roping_id, organization_id)
    references public.ropings(id, organization_id) on delete cascade
);

create index event_contestant_check_ins_roping_time_idx
on public.event_contestant_check_ins (roping_id, checked_in_at);

alter table public.event_contestant_check_ins enable row level security;

create policy "Producer users can read contestant check-ins"
on public.event_contestant_check_ins for select
using (public.has_organization_access(organization_id));

create trigger audit_event_contestant_check_ins
after insert or update or delete on public.event_contestant_check_ins
for each row execute function public.write_audit_log();

create function public.set_event_contestant_check_in(
  target_roping_id uuid,
  target_person_id uuid,
  is_checked_in boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.ropings%rowtype;
begin
  select * into event_record
  from public.ropings
  where id = target_roping_id;

  if event_record.id is null
    or not public.can_manage_organization(event_record.organization_id) then
    raise exception 'You do not have permission to manage check-in for this event';
  end if;
  if event_record.status in ('completed', 'cancelled') then
    raise exception 'Check-in cannot change after the event is completed or cancelled';
  end if;
  if is_checked_in and not exists (
    select 1 from public.entries
    where roping_id = target_roping_id
      and person_id = target_person_id
      and competition_status = 'active'
  ) then
    raise exception 'This contestant does not have an active entry in the event';
  end if;

  if is_checked_in then
    insert into public.event_contestant_check_ins (
      organization_id, roping_id, person_id, checked_in_at, checked_in_by
    ) values (
      event_record.organization_id, event_record.id, target_person_id,
      now(), auth.uid()
    )
    on conflict (roping_id, person_id)
    do update set checked_in_at = now(), checked_in_by = auth.uid();
  else
    delete from public.event_contestant_check_ins
    where roping_id = target_roping_id and person_id = target_person_id;
  end if;

  return is_checked_in;
end;
$$;

revoke all on function public.set_event_contestant_check_in(uuid, uuid, boolean)
from public;
grant execute on function public.set_event_contestant_check_in(uuid, uuid, boolean)
to authenticated;
