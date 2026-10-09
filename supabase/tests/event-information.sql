-- Exercise permissions and audit history without retaining fixture changes.
begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text
  from public.producer_staff where role='owner' order by created_at,user_id limit 1),true);
set local role authenticated;
do $$
declare event public.events;
begin
  select * into event from public.events where public.can_manage_event(id) order by id limit 1;
  if event.id is null then raise exception 'An owner event fixture is required'; end if;
  insert into public.event_information(id,producer_id,contact_name,directions)
    values(event.id,event.producer_id,'Event information test','Use the west gate')
    on conflict(id) do update set contact_name=excluded.contact_name,directions=excluded.directions;
  if not exists(select 1 from public.event_information where id=event.id and directions='Use the west gate') then
    raise exception 'Manager cannot maintain information'; end if;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.producer_audit_log where entity_type='event_information' and after_data->>'contact_name'='Event information test') then
    raise exception 'Information edits were not audited'; end if;
end $$;
set local role anon;
do $$ declare changed bigint; begin
  if exists(select 1 from public.event_information i where not exists(select 1 from public.public_event_schedule e where e.id=i.id)) then
    raise exception 'Private event information leaked'; end if;
  begin
    update public.event_information set contact_name='Unauthorized';
    get diagnostics changed = row_count;
    if changed<>0 then raise exception 'Anonymous writes were permitted'; end if;
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
rollback;
