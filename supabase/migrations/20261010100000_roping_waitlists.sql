alter table public.event_ropings add column entry_limit integer check (entry_limit between 1 and 100000);

create table public.roping_waitlist (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  event_id uuid not null,
  event_roping_id uuid not null,
  roper_id uuid references public.ropers(id),
  guest jsonb,
  option_ids uuid[] not null default '{}',
  override_reason text,
  status text not null default 'waiting' check (status in ('waiting','offered','accepted','declined','cancelled')),
  entry_id uuid references public.roping_entries(id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  offered_at timestamptz,
  resolved_at timestamptz,
  note text not null default '',
  revision integer not null default 1,
  foreign key (event_id,producer_id) references public.events(id,producer_id) on delete cascade,
  foreign key (event_roping_id,producer_id) references public.event_ropings(id,producer_id) on delete cascade,
  check ((roper_id is not null and guest is null) or (roper_id is null and guest is not null))
);
create index roping_waitlist_queue_idx on public.roping_waitlist(event_roping_id,status,created_at,id);
alter table public.roping_waitlist enable row level security;
create policy waitlist_staff_read on public.roping_waitlist for select to authenticated
  using (public.can_enter_event(event_id));
revoke all on public.roping_waitlist from anon,authenticated;
grant select on public.roping_waitlist to authenticated;
create trigger waitlist_audit after insert or update or delete on public.roping_waitlist
  for each row execute function public.write_audit_log();

create function public.enforce_roping_capacity() returns trigger language plpgsql security definer set search_path='' as $$
declare r public.event_ropings%rowtype; used integer;
begin
  if new.competition_status <> 'active' then return new; end if;
  if tg_op='UPDATE' and old.event_roping_id=new.event_roping_id and old.competition_status='active' then return new; end if;
  select * into r from public.event_ropings where id=new.event_roping_id for update;
  if r.entry_limit is null then return new; end if;
  select count(*) into used from public.roping_entries where event_roping_id=r.id and competition_status='active' and id<>new.id;
  used:=used+(select count(*) from public.roping_waitlist where event_roping_id=r.id and status='offered');
  if used>=r.entry_limit then raise exception 'This roping is full. Add the contestant to its waitlist instead.'; end if;
  return new;
end $$;
create trigger enforce_roping_capacity before insert or update of event_roping_id,competition_status on public.roping_entries
  for each row execute function public.enforce_roping_capacity();

create function public.set_roping_entry_limit(target_roping uuid, new_limit integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.event_ropings%rowtype; used integer;
begin
  select * into r from public.event_ropings where id=target_roping for update;
  if r.id is null or not public.can_manage_event(r.event_id) then raise exception 'Event manager access is required'; end if;
  if r.event_day_status='completed' then raise exception 'This roping is complete'; end if;
  if new_limit is not null and (new_limit<1 or new_limit>100000) then raise exception 'Enter a valid entry limit'; end if;
  select count(*) into used from public.roping_entries where event_roping_id=r.id and competition_status='active';
  used:=used+(select count(*) from public.roping_waitlist where event_roping_id=r.id and status='offered');
  if new_limit<used then raise exception 'The limit cannot be lower than accepted entries and reserved offers'; end if;
  update public.event_ropings set entry_limit=new_limit where id=r.id;
end $$;

create function public.join_roping_waitlist(target_roping uuid, target_roper uuid, guest_details jsonb,
  selected_options uuid[], eligibility_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.event_ropings%rowtype; result uuid;
begin
  select * into r from public.event_ropings where id=target_roping for update;
  if r.id is null or not public.can_enter_event(r.event_id) then raise exception 'Entry office access is required'; end if;
  if r.event_day_status='completed' then raise exception 'This roping is complete'; end if;
  if r.entry_limit is null then raise exception 'Set an entry limit before using the waitlist'; end if;
  if eligibility_reason is not null and not public.can_manage_event(r.event_id) then raise exception 'Only managers may approve an eligibility exception'; end if;
  if target_roper is null and (not r.allow_non_members or nullif(trim(guest_details->>'firstName'),'') is null or nullif(trim(guest_details->>'lastName'),'') is null or coalesce(guest_details->>'competitionGender','') not in ('female','male')) then raise exception 'Provide valid guest details for a roping that allows guests'; end if;
  if exists(select 1 from unnest(selected_options) o where not exists(select 1 from public.event_fees f where f.id=o and f.event_roping_id=r.id and not f.is_required)) then raise exception 'Choose optional fees from this roping'; end if;
  insert into public.roping_waitlist(producer_id,event_id,event_roping_id,roper_id,guest,option_ids,override_reason)
    values(r.producer_id,r.event_id,r.id,target_roper,guest_details,coalesce(selected_options,'{}'),eligibility_reason) returning id into result;
  return result;
end $$;

create function public.resolve_roping_waitlist(target_waitlist uuid, expected_revision integer, decision text, staff_note text)
returns uuid language plpgsql security definer set search_path='' as $$
declare w public.roping_waitlist%rowtype; r public.event_ropings%rowtype; used integer; result uuid; option_id uuid;
begin
  select * into w from public.roping_waitlist where id=target_waitlist;
  if w.id is null or not public.can_enter_event(w.event_id) then raise exception 'Entry office access is required'; end if;
  select * into r from public.event_ropings where id=w.event_roping_id for update;
  select * into w from public.roping_waitlist where id=target_waitlist for update;
  if w.revision<>expected_revision then raise exception 'This waitlist entry changed. Refresh before trying again.'; end if;
  if r.event_day_status='completed' then raise exception 'This roping is complete'; end if;
  if w.status not in ('waiting','offered') then raise exception 'This waitlist entry has already been resolved'; end if;
  if decision='offer' then
    if w.status<>'waiting' then raise exception 'A space is already offered'; end if;
    if w.id<>(select id from public.roping_waitlist where event_roping_id=r.id and status='waiting' order by created_at,id limit 1) then raise exception 'Offer the next contestant in queue order'; end if;
    select count(*) into used from public.roping_entries where event_roping_id=r.id and competition_status='active';
    used:=used+(select count(*) from public.roping_waitlist where event_roping_id=r.id and status='offered');
    if r.entry_limit is not null and used>=r.entry_limit then raise exception 'No space is available yet'; end if;
    update public.roping_waitlist set status='offered',offered_at=now(),note=coalesce(staff_note,''),revision=revision+1 where id=w.id;
  elsif decision='accept' then
    if w.status<>'offered' then raise exception 'Offer a space before confirming acceptance'; end if;
    if w.override_reason is not null and not public.can_manage_event(w.event_id) then raise exception 'A manager must confirm this eligibility exception'; end if;
    -- Release this reservation inside the same locked transaction; failures restore it.
    update public.roping_waitlist set status='accepted' where id=w.id;
    if w.roper_id is not null then
      result:=public.create_event_entry_with_eligibility_override(r.id,w.roper_id,'office','unpaid',w.override_reason);
    else
      result:=public.create_guest_event_entry_v2_with_eligibility_override(r.id,w.guest->>'firstName',w.guest->>'lastName',w.guest->>'email',w.guest->>'phone',nullif(w.guest->>'birthDate','')::date,(w.guest->>'competitionGender')::public.competition_gender,'unpaid',w.override_reason);
    end if;
    foreach option_id in array w.option_ids loop perform public.add_entry_option(result,option_id); end loop;
    update public.roping_waitlist set entry_id=result,resolved_at=now(),note=coalesce(staff_note,''),revision=revision+1 where id=w.id;
  elsif decision in ('decline','cancel') then
    if length(trim(coalesce(staff_note,'')))<5 then raise exception 'Enter a brief reason'; end if;
    update public.roping_waitlist set status=case when decision='decline' then 'declined' else 'cancelled' end,resolved_at=now(),note=staff_note,revision=revision+1 where id=w.id;
  else raise exception 'Choose a valid waitlist action'; end if;
  return result;
end $$;
revoke all on function public.enforce_roping_capacity(),public.set_roping_entry_limit(uuid,integer),public.join_roping_waitlist(uuid,uuid,jsonb,uuid[],text),public.resolve_roping_waitlist(uuid,integer,text,text) from public,anon;
grant execute on function public.set_roping_entry_limit(uuid,integer),public.join_roping_waitlist(uuid,uuid,jsonb,uuid[],text),public.resolve_roping_waitlist(uuid,integer,text,text) to authenticated;
