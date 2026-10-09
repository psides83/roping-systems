begin;
do $$
declare target public.event_ropings; before_count bigint; expected bigint; after_count bigint;
begin
  select * into target from public.event_ropings er
    where er.payouts_finalized_at is null and exists(select 1 from public.roping_entries e where e.event_roping_id=er.id and e.competition_status='active')
    order by er.id limit 1;
  if target.id is null then raise exception 'Notification test needs an entered roping'; end if;
  select count(*) into before_count from public.in_app_notifications;
  update public.event_ropings set schedule_note=schedule_note where id=target.id;
  select count(*) into after_count from public.in_app_notifications;
  if before_count<>after_count then raise exception 'No-op save emitted notices'; end if;
  select count(distinct roper_id) into expected from public.roping_entries
    where event_roping_id=target.id and competition_status='active';
  update public.event_ropings set schedule_note=coalesce(schedule_note,'')||' notification test' where id=target.id;
  select count(*) into after_count from public.in_app_notifications;
  if after_count-before_count<>expected then raise exception 'Schedule notice recipients were not deduplicated'; end if;
  if has_table_privilege('authenticated','public.in_app_notifications','INSERT') then raise exception 'Recipients may forge notices'; end if;
  if has_table_privilege('anon','public.in_app_notifications','SELECT') then raise exception 'Anonymous access to notices'; end if;
  if not (select relrowsecurity from pg_class where oid='public.notification_read_states'::regclass) then raise exception 'Read states missing RLS'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
do $$
begin
  if exists(select 1 from public.in_app_notifications) then raise exception 'Unlinked user can read notices'; end if;
  if exists(select 1 from public.staff_notification_items('8f96f20f-932b-45ae-ac93-9832818de64d')) then raise exception 'Non-staff can read reminders'; end if;
  if exists(select 1 from public.my_notification_memberships()) then raise exception 'Unlinked user can discover memberships'; end if;
end $$;
reset role;
rollback;
