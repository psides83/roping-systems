begin;
do $$
declare
  producer uuid := '8f96f20f-932b-45ae-ac93-9832818de64d';
  member_id uuid; roper uuid; roping uuid; entry uuid;
  suspension uuid := gen_random_uuid(); scheduled uuid := gen_random_uuid();
  today date; event_date date; owner_id uuid;
begin
  select user_id into owner_id from public.producer_staff where producer_id = producer and role = 'owner' limit 1;
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  select m.id,m.roper_id,e.event_roping_id,e.id into member_id,roper,roping,entry
    from public.memberships m join public.roping_entries e on e.roper_id = m.roper_id and e.producer_id = m.producer_id
    where m.producer_id = producer and e.competition_status = 'active' limit 1;
  if member_id is null then raise exception 'Test requires an entered member'; end if;
  select (now() at time zone timezone)::date into today from public.producers where id = producer;
  select scheduled_date into event_date from public.event_ropings where id = roping;
  perform public.issue_membership_suspension(member_id,suspension,today,today,'Test disciplinary suspension');
  perform public.issue_membership_suspension(member_id,suspension,today,today,'Test disciplinary suspension');
  if (select count(*) from public.membership_suspensions where id = suspension) <> 1 then raise exception 'Retry duplicated suspension'; end if;
  if not public.membership_suspension_blocks(producer,roper,roping) then raise exception 'Active suspension not enforced'; end if;
  if public.membership_suspension_blocks(gen_random_uuid(),roper,roping) then raise exception 'Restriction leaked to another producer'; end if;
  update public.roping_entries set competition_status = 'withdrawn' where id = entry;
  begin
    update public.roping_entries set competition_status = 'active' where id = entry;
    raise exception 'Suspended entry accepted';
  exception when others then
    if sqlerrm not like 'A membership suspension prevents this entry.%' then raise; end if;
  end;
  perform public.lift_membership_suspension(suspension,'Producer approved early reinstatement');
  if public.membership_suspension_blocks(producer,roper,roping) then raise exception 'Lift did not clear suspension'; end if;
  if not exists(select 1 from public.membership_suspensions where id = suspension and lifted_by = owner_id and lift_reason = 'Producer approved early reinstatement') then raise exception 'Lift history missing'; end if;
  perform public.issue_membership_suspension(member_id,scheduled,event_date,event_date,'Suspension covers the roping date');
  if not public.membership_suspension_blocks(producer,roper,roping) then raise exception 'Roping date not enforced'; end if;
  update public.membership_suspensions set starts_on = '1900-01-01', ends_on = '1900-01-02' where id = scheduled;
  if public.membership_suspension_blocks(producer,roper,roping) then raise exception 'Expired suspension still blocks'; end if;
  begin
    perform public.issue_membership_suspension(member_id,gen_random_uuid(),today,today-1,'Invalid reversed dates');
    raise exception 'Invalid dates accepted';
  exception when others then
    if sqlerrm = 'Invalid dates accepted' then raise; end if;
  end;
  begin
    perform public.issue_membership_suspension(member_id,gen_random_uuid(),today,today,'');
    raise exception 'Missing reason accepted';
  exception when others then
    if sqlerrm = 'Missing reason accepted' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.issue_membership_suspension(member_id,gen_random_uuid(),today,today,'Unauthorized suspension');
    raise exception 'Unauthorized suspension accepted';
  exception when others then
    if sqlerrm = 'Unauthorized suspension accepted' then raise; end if;
  end;
  execute 'set local role authenticated';
  if exists(select 1 from public.membership_suspensions where membership_id = member_id) then raise exception 'Unrelated account can see suspension history'; end if;
  execute 'reset role';
end $$;
rollback;
