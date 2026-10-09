-- Staff reminders are live projections; roper change notices retain their history.
create table public.in_app_notifications (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete cascade,
  roper_id uuid not null references public.ropers(id) on delete cascade,
  category text not null check(category in ('entry','schedule','classification')),
  title text not null,
  body text not null,
  href text not null check(href like '/roper%' or href like '/public/%'),
  created_at timestamptz not null default clock_timestamp()
);
create index in_app_notifications_recipient on public.in_app_notifications(roper_id,created_at desc,id);
create table public.notification_read_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_key text not null check(length(notification_key) between 1 and 300),
  revision text not null check(length(revision) between 1 and 20000),
  read_at timestamptz not null default now(),
  primary key(user_id,notification_key)
);
alter table public.in_app_notifications enable row level security;
alter table public.notification_read_states enable row level security;
revoke all on public.in_app_notifications,public.notification_read_states from anon,authenticated;
grant select on public.in_app_notifications to authenticated;
grant select,insert,update,delete on public.notification_read_states to authenticated;
create policy "Ropers read their own notices" on public.in_app_notifications for select to authenticated
using(exists(select 1 from public.ropers r where r.id=roper_id and r.auth_user_id=auth.uid())
  or exists(select 1 from public.memberships m where m.roper_id=in_app_notifications.roper_id
    and m.producer_id=in_app_notifications.producer_id and public.owns_membership(m.id)));
create policy "Own notification read states" on public.notification_read_states for all to authenticated
using(user_id=auth.uid()) with check(user_id=auth.uid());

create function public.my_notification_memberships()
returns table(id uuid,producer_id uuid,producer_name text,producer_slug text)
language sql stable security definer set search_path='' as $$
  select m.id,p.id,p.name,p.slug from public.memberships m join public.producers p on p.id=m.producer_id
  where public.owns_membership(m.id) order by p.name,m.id;
$$;

create function public.staff_notification_items(target_producer uuid)
returns table(id text,revision text,category text,title text,body text,href text,created_at timestamptz)
language sql stable security definer set search_path='' as $$
  select 'application:'||a.id,a.updated_at::text,'application','Membership application pending',
    a.applicant_name||' is waiting for staff review.','/settings/membership-form',a.submitted_at
  from public.membership_applications a where a.producer_id=target_producer and a.status='pending'
    and public.can_manage_organization(a.producer_id)
  union all
  select 'watch:'||f.id,f.updated_at::text,'watch','Classification watch flag',
    r.first_name||' '||r.last_name||' · '||f.measured_seconds::text||' seconds · Round '||f.round_number,
    case when public.can_manage_organization(f.producer_id) then '/members/'||f.membership_id
      else '/events/'||f.event_id||'/live?roping='||f.event_roping_id end,f.updated_at
  from public.classification_run_flags f join public.memberships m on m.id=f.membership_id
    join public.ropers r on r.id=m.roper_id
  where f.producer_id=target_producer and f.is_active and f.reviewed_at is null
    and (public.can_manage_organization(f.producer_id) or public.can_time_roping(f.event_roping_id))
  union all
  select 'fine:'||f.id,concat(public.member_fine_balance(f.id),':',coalesce((select max(t.created_at) from public.member_fine_transactions t where t.fine_id=f.id),f.issued_at)),
    'fine','Unpaid member fine',r.first_name||' '||r.last_name||' · $'||to_char(public.member_fine_balance(f.id)/100.0,'FM9999999990.00')||' outstanding',
    '/members/'||f.membership_id,coalesce((select max(t.created_at) from public.member_fine_transactions t where t.fine_id=f.id),f.issued_at)
  from public.member_fines f join public.memberships m on m.id=f.membership_id join public.ropers r on r.id=m.roper_id
  where f.producer_id=target_producer and public.can_manage_finances(f.producer_id) and public.member_fine_balance(f.id)>0
  union all
  select 'online:'||s.id,s.updated_at::text,'application','Online entries pending',
    s.first_name||' '||s.last_name||' · '||e.title,'/events/'||e.id||'/entries',s.created_at
  from public.online_entry_submissions s join public.events e on e.id=s.event_id
  where s.producer_id=target_producer and s.status='pending' and public.can_collect_event(s.event_id);
$$;
revoke all on function public.my_notification_memberships(),public.staff_notification_items(uuid) from public,anon;
grant execute on function public.my_notification_memberships(),public.staff_notification_items(uuid) to authenticated;

create function public.notify_accepted_roping_entry() returns trigger
language plpgsql security definer set search_path='' as $$
declare label text; slug text; event_title text;
begin
  if new.competition_status<>'active' then return new; end if;
  if tg_op='UPDATE' and (new.competition_status,new.event_roping_id) is not distinct from (old.competition_status,old.event_roping_id) then return new; end if;
  select er.name,p.slug,e.title into label,slug,event_title from public.event_ropings er
    join public.events e on e.id=er.event_id join public.producers p on p.id=er.producer_id where er.id=new.event_roping_id;
  insert into public.in_app_notifications(producer_id,roper_id,category,title,body,href)
    values(new.producer_id,new.roper_id,'entry','Entry accepted',event_title||' · '||label||'. Check your portal for entry details and any unpaid balance.',
      '/roper?producer='||slug||'&view=entries');
  return new;
end; $$;
create trigger notify_accepted_roping_entry after insert or update of competition_status,event_roping_id on public.roping_entries
for each row execute function public.notify_accepted_roping_entry();

create function public.notify_roping_schedule_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_title text; slug text;
begin
  if (new.scheduled_date,new.starts_at,new.estimated_starts_at,new.schedule_type,new.arena_name,new.schedule_note,new.sort_order)
    is not distinct from (old.scheduled_date,old.starts_at,old.estimated_starts_at,old.schedule_type,old.arena_name,old.schedule_note,old.sort_order) then return new; end if;
  select e.title,p.slug into event_title,slug from public.events e join public.producers p on p.id=e.producer_id where e.id=new.event_id;
  insert into public.in_app_notifications(producer_id,roper_id,category,title,body,href)
    select distinct new.producer_id,e.roper_id,'schedule','Roping schedule changed',
      event_title||' · '||new.name||' · '||new.scheduled_date||'. Review the latest date, start listing, and arena before competing.',
      '/roper?producer='||slug||'&view=entries'
    from public.roping_entries e where e.event_roping_id=new.id and e.competition_status='active';
  return new;
end; $$;
create trigger notify_roping_schedule_change after update on public.event_ropings
for each row execute function public.notify_roping_schedule_change();

create function public.notify_event_details_change() returns trigger
language plpgsql security definer set search_path='' as $$
declare slug text;
begin
  if (new.title,new.starts_at,new.ends_at,new.venue_name,new.address,new.venue_city,new.venue_state,new.venue_postal_code,new.entries_open_at,new.entries_close_at,new.status)
    is not distinct from (old.title,old.starts_at,old.ends_at,old.venue_name,old.address,old.venue_city,old.venue_state,old.venue_postal_code,old.entries_open_at,old.entries_close_at,old.status) then return new; end if;
  -- Starting or completing an event alone is not a schedule notice.
  if (new.title,new.starts_at,new.ends_at,new.venue_name,new.address,new.venue_city,new.venue_state,new.venue_postal_code,new.entries_open_at,new.entries_close_at)
    is not distinct from (old.title,old.starts_at,old.ends_at,old.venue_name,old.address,old.venue_city,old.venue_state,old.venue_postal_code,old.entries_open_at,old.entries_close_at)
    and new.status<>'cancelled' then return new; end if;
  select p.slug into slug from public.producers p where p.id=new.producer_id;
  insert into public.in_app_notifications(producer_id,roper_id,category,title,body,href)
    select distinct new.producer_id,e.roper_id,'schedule',case when new.status='cancelled' then 'Event cancelled' else 'Event details changed' end,
      new.title||'. Review the latest dates, location, and entry deadlines.', '/roper?producer='||slug||'&view=entries'
    from public.roping_entries e where e.event_id=new.id and e.competition_status='active';
  return new;
end; $$;
create trigger notify_event_details_change after update on public.events
for each row execute function public.notify_event_details_change();

create function public.notify_member_classification() returns trigger
language plpgsql security definer set search_path='' as $$
declare person uuid; slug text; label text;
begin
  if tg_op='UPDATE' and (new.classification_id,new.effective_on) is not distinct from (old.classification_id,old.effective_on) then return new; end if;
  select m.roper_id,p.slug,c.name||' '||d.name into person,slug,label from public.memberships m
    join public.producers p on p.id=m.producer_id join public.classifications c on c.id=new.classification_id
    join public.divisions d on d.id=c.division_id where m.id=new.membership_id;
  insert into public.in_app_notifications(producer_id,roper_id,category,title,body,href)
    values(new.producer_id,person,'classification','Classification updated',label||' · Effective '||new.effective_on||'. Review your current membership classification in the portal.',
      '/roper?producer='||slug||'&view=membership');
  return new;
end; $$;
create trigger notify_member_classification after insert or update of classification_id,effective_on on public.membership_classification_history
for each row execute function public.notify_member_classification();
revoke all on function public.notify_accepted_roping_entry(),public.notify_roping_schedule_change(),public.notify_event_details_change(),public.notify_member_classification() from public,anon,authenticated;
