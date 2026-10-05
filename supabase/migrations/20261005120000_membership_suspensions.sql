create table public.membership_suspensions (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  membership_id uuid not null,
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on),
  reason text not null check (length(trim(reason)) between 5 and 2000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  staff_label text not null,
  lifted_at timestamptz,
  lifted_by uuid references auth.users(id),
  lifted_by_label text,
  lift_reason text,
  check ((lifted_at is null and lifted_by is null and lifted_by_label is null and lift_reason is null)
    or (lifted_at is not null and lifted_by is not null and lifted_by_label is not null and length(trim(lift_reason)) between 5 and 2000)),
  foreign key (membership_id, producer_id) references public.memberships(id, producer_id)
);
create index membership_suspensions_member_idx on public.membership_suspensions(membership_id, starts_on desc);
alter table public.membership_suspensions enable row level security;
create policy "Staff and affected members can read suspensions" on public.membership_suspensions
  for select to authenticated using(public.can_read_member_fines(membership_id));
create trigger audit_membership_suspensions after insert or update or delete on public.membership_suspensions
  for each row execute function public.write_audit_log();

create function public.membership_suspension_calendar(target_membership_id uuid)
returns table(today date) language sql stable security definer set search_path = '' as $$
  select (now() at time zone p.timezone)::date from public.memberships m
    join public.producers p on p.id = m.producer_id
    where m.id = target_membership_id and public.can_read_member_fines(m.id);
$$;
revoke all on function public.membership_suspension_calendar(uuid) from public, anon;
grant execute on function public.membership_suspension_calendar(uuid) to authenticated;

create function public.issue_membership_suspension(target_membership_id uuid, target_suspension_id uuid,
  target_starts_on date, target_ends_on date, target_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.memberships%rowtype;
begin
  select * into m from public.memberships where id = target_membership_id for update;
  if not found or auth.uid() is null or not public.can_manage_organization(m.producer_id) then
    raise exception 'You do not have permission to suspend this membership'; end if;
  if target_suspension_id is null or target_starts_on is null or target_ends_on is null
    or target_ends_on < target_starts_on or length(trim(coalesce(target_reason,''))) not between 5 and 2000 then
    raise exception 'Provide start and end dates and a clearly explained reason'; end if;
  if exists(select 1 from public.membership_suspensions where id = target_suspension_id) then
    if exists(select 1 from public.membership_suspensions where id = target_suspension_id
      and membership_id = m.id and starts_on = target_starts_on and ends_on = target_ends_on
      and reason = trim(target_reason)) then return target_suspension_id; end if;
    raise exception 'This suspension reference has already been used';
  end if;
  insert into public.membership_suspensions(id,producer_id,membership_id,starts_on,ends_on,reason,created_by,staff_label)
  values(target_suspension_id,m.producer_id,m.id,target_starts_on,target_ends_on,trim(target_reason),auth.uid(),coalesce(auth.jwt()->>'email',auth.uid()::text));
  return target_suspension_id;
end;
$$;
create function public.lift_membership_suspension(target_suspension_id uuid, target_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare s public.membership_suspensions%rowtype;
begin
  select * into s from public.membership_suspensions where id = target_suspension_id for update;
  if not found or auth.uid() is null or not public.can_manage_organization(s.producer_id) then
    raise exception 'You do not have permission to lift this suspension'; end if;
  if length(trim(coalesce(target_reason,''))) not between 5 and 2000 then raise exception 'Explain why this suspension is being lifted'; end if;
  if s.lifted_at is not null then raise exception 'This suspension has already been lifted'; end if;
  update public.membership_suspensions set lifted_at = now(), lifted_by = auth.uid(),
    lifted_by_label = coalesce(auth.jwt()->>'email',auth.uid()::text), lift_reason = trim(target_reason)
    where id = s.id;
end;
$$;

create function public.membership_suspension_blocks(target_producer_id uuid, target_roper_id uuid, target_roping_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.membership_suspensions s
    join public.memberships m on m.id = s.membership_id
    join public.producers p on p.id = s.producer_id
    join public.event_ropings r on r.id = target_roping_id and r.producer_id = p.id
    where s.producer_id = target_producer_id and m.roper_id = target_roper_id and s.lifted_at is null
      and (((now() at time zone p.timezone)::date between s.starts_on and s.ends_on)
        or (r.scheduled_date between s.starts_on and s.ends_on)));
$$;
create function public.enforce_membership_suspension_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.competition_status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and new.event_roping_id = old.event_roping_id and new.roper_id = old.roper_id
    and new.competition_status = old.competition_status then return new; end if;
  if public.membership_suspension_blocks(new.producer_id,new.roper_id,new.event_roping_id) then
    raise exception 'A membership suspension prevents this entry. Contact the producer.'; end if;
  return new;
end;
$$;
create trigger entries_enforce_membership_suspension before insert or update of event_roping_id,roper_id,competition_status
  on public.roping_entries for each row execute function public.enforce_membership_suspension_entry();

create function public.enforce_online_membership_suspension() returns trigger
language plpgsql security definer set search_path = '' as $$
declare request public.online_entry_submissions%rowtype; roper uuid;
begin
  select * into request from public.online_entry_submissions where id = new.submission_id;
  roper := request.roper_id;
  if roper is null then
    select m.roper_id into roper from public.memberships m join public.ropers r on r.id = m.roper_id
      where m.producer_id = request.producer_id and lower(r.email) = lower(request.email) limit 1;
  end if;
  if public.membership_suspension_blocks(request.producer_id,roper,new.event_roping_id) then
    raise exception 'A membership suspension prevents this entry. Contact the producer.'; end if;
  return new;
end;
$$;
create trigger online_entries_enforce_membership_suspension before insert or update of event_roping_id,submission_id
  on public.online_entry_submission_ropings for each row execute function public.enforce_online_membership_suspension();
revoke all on function public.issue_membership_suspension(uuid,uuid,date,date,text),
  public.lift_membership_suspension(uuid,text) from public, anon;
grant execute on function public.issue_membership_suspension(uuid,uuid,date,date,text),
  public.lift_membership_suspension(uuid,text) to authenticated;
revoke all on function public.membership_suspension_blocks(uuid,uuid,uuid),
  public.enforce_membership_suspension_entry(), public.enforce_online_membership_suspension() from public, anon, authenticated;
