create table public.staff_event_assignments (
  producer_id uuid not null,
  event_id uuid not null,
  user_id uuid not null,
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(producer_id,event_id,user_id),
  foreign key(producer_id,user_id) references public.producer_staff(producer_id,user_id) on delete cascade,
  foreign key(event_id,producer_id) references public.events(id,producer_id) on delete cascade
);
alter table public.staff_event_assignments enable row level security;
revoke all on public.staff_event_assignments from anon,authenticated;
grant select on public.staff_event_assignments to authenticated;
create policy "Staff see own assignments and managers see all" on public.staff_event_assignments
for select to authenticated using (public.can_administer_organization(producer_id) or user_id=auth.uid());
create trigger audit_staff_event_assignments after insert or update or delete on public.staff_event_assignments
for each row execute function public.write_audit_log();
create function public.assign_staff_event(target_producer uuid,target_event uuid,target_user uuid,assigned boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.producers where id=target_producer for update;
  if not public.can_administer_organization(target_producer) then
    raise exception 'Event assignments require an owner or administrator.';
  end if;
  if not exists(select 1 from public.events where id=target_event and producer_id=target_producer)
    or not exists(select 1 from public.producer_staff where producer_id=target_producer and user_id=target_user) then
    raise exception 'Choose an event and staff member from this producer.';
  end if;
  if assigned is null then raise exception 'Choose an assignment action.'; end if;
  if assigned then
    insert into public.staff_event_assignments(producer_id,event_id,user_id,assigned_by)
    values(target_producer,target_event,target_user,auth.uid()) on conflict do nothing;
  else
    delete from public.staff_event_assignments where producer_id=target_producer and event_id=target_event and user_id=target_user;
  end if;
end;
$$;
revoke all on function public.assign_staff_event(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.assign_staff_event(uuid,uuid,uuid,boolean) to authenticated;
