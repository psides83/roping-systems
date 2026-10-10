begin;
do $$
declare account uuid; member public.memberships%rowtype; target public.event_ropings%rowtype;
  season uuid; rule uuid; payload jsonb; checks_before bigint; assignments_before bigint; rejected boolean;
begin
  select id into strict account from auth.users where lower(email)='psides83@hotmail.com';
  select m.* into strict member from public.memberships m
    where exists(select 1 from public.event_ropings r join public.events e on e.id=r.event_id
      where r.producer_id=m.producer_id and r.scheduled_date>=current_date and r.event_day_status='scheduled'
        and e.is_public and e.publication_state='published') limit 1;
  select r.* into strict target from public.event_ropings r join public.events e on e.id=r.event_id
    where r.producer_id=member.producer_id and r.scheduled_date>=current_date and r.event_day_status='scheduled'
      and e.is_public and e.publication_state='published' and e.status not in ('cancelled','completed') limit 1;
  select id into strict season from public.producer_seasons where producer_id=member.producer_id
    and target.scheduled_date between starts_on and ends_on limit 1;
  update public.ropers set auth_user_id=null where auth_user_id=account;
  update public.ropers set auth_user_id=account where id=member.roper_id;
  perform set_config('request.jwt.claim.sub',account::text,true);
  insert into public.qualification_rule_sets(producer_id,name,season_id,top_places,minimum_ropings,bonus_entries_enabled)
    values(member.producer_id,'Outlook rollback fixture',season,10,10,true) returning id into rule;
  update public.event_ropings set qualification_override='custom',qualification_rule_set_id=rule where id=target.id;
  update public.events set qualification_rule_set_id=rule where id=target.event_id;
  update public.event_ropings set qualification_override='inherit',qualification_rule_set_id=null
    where event_id=target.event_id and id<>target.id and event_day_status='scheduled';
  select count(*) into checks_before from public.roping_qualification_checks;
  select count(*) into assignments_before from public.finals_position_assignments;
  payload:=public.my_roper_finals_outlook_context(member.id,season);
  if not exists(select 1 from jsonb_array_elements(payload->'targets') t where t->>'id'=target.id::text) then
    raise exception 'Published upcoming qualification roping missing'; end if;
  if (select count(*) from public.roping_qualification_checks)<>checks_before
    or (select count(*) from public.finals_position_assignments)<>assignments_before then
    raise exception 'Read-only outlook changed qualification state'; end if;
  if exists(select 1 from jsonb_array_elements(payload->'targets') t
    join public.event_ropings r on r.id=(t->>'id')::uuid join public.events e on e.id=r.event_id
    where r.producer_id<>member.producer_id or r.scheduled_date<current_date
      or r.event_day_status in ('in_progress','completed') or e.status in ('cancelled','completed')
      or not e.is_public or e.publication_state<>'published') then
    raise exception 'Outlook includes a non-upcoming or wrong-producer target'; end if;
  update public.event_ropings set qualification_override='none',qualification_rule_set_id=null where id=target.id;
  payload:=public.my_roper_finals_outlook_context(member.id,season);
  if exists(select 1 from jsonb_array_elements(payload->'targets') t where t->>'id'=target.id::text) then
    raise exception 'Non-qualifying override exposed'; end if;
  update public.event_ropings set qualification_override='custom',qualification_rule_set_id=rule where id=target.id;
  update public.events set is_public=false where id=target.event_id;
  payload:=public.my_roper_finals_outlook_context(member.id,season);
  if exists(select 1 from jsonb_array_elements(payload->'targets') t where t->>'eventId'=target.event_id::text) then
    raise exception 'Private event exposed'; end if;
  update public.events set is_public=true,publication_state='draft' where id=target.event_id;
  payload:=public.my_roper_finals_outlook_context(member.id,season);
  if exists(select 1 from jsonb_array_elements(payload->'targets') t where t->>'eventId'=target.event_id::text) then
    raise exception 'Draft event exposed'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  rejected:=false;
  begin perform public.my_roper_finals_outlook_context(member.id,season);
    exception when raise_exception then
      if sqlerrm not like '%not linked%' then raise; end if; rejected:=true;
  end;
  if not rejected then raise exception 'Unlinked user accessed outlook'; end if;
  if has_function_privilege('anon','public.my_roper_finals_outlook_context(uuid,uuid)','EXECUTE') then
    raise exception 'Anonymous outlook access granted'; end if;
end; $$;
rollback;
