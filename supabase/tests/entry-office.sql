begin;
do $$
declare platform_user uuid; office_user uuid := gen_random_uuid(); target record;
  member_roper uuid; invitation uuid; created_entry uuid; other_event uuid;
begin
  select id into strict platform_user from auth.users where lower(email)='psides83@hotmail.com';
  select r.id,r.producer_id,r.event_id into strict target from public.event_ropings r
    where r.event_id='0405a4f6-bdf6-49d6-af75-7f665006308b' and r.name ilike '%open%' order by r.id limit 1;
  select m.roper_id into strict member_roper from public.memberships m join public.ropers p on p.id=m.roper_id
    where m.producer_id=target.producer_id and m.status='active' and p.competition_gender='female'
    and not exists(select 1 from public.roping_entries e where e.event_roping_id=target.id and e.roper_id=m.roper_id)
    order by m.id limit 1;
  select id into strict other_event from public.events where id<>target.event_id order by id limit 1;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    values(office_user,'office-' || office_user::text || '@example.com',now(),'{}');
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  invitation := public.invite_producer_staff(target.producer_id,'office-' || office_user::text || '@example.com','entry_office');
  perform set_config('request.jwt.claim.sub',office_user::text,true);
  perform public.accept_staff_invitation(invitation);
  if public.can_enter_event(target.event_id) then raise exception 'Unassigned office can enter event'; end if;
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  perform public.assign_staff_event(target.producer_id,target.event_id,office_user,true);
  perform set_config('request.jwt.claim.sub',office_user::text,true);
  execute 'set local role authenticated';
  if not public.can_enter_event(target.event_id) or public.can_enter_event(other_event) or public.can_time_event(target.event_id)
    or public.can_manage_organization(target.producer_id) then raise exception 'Office permission scope incorrect'; end if;
  begin
    perform public.create_event_entry_with_eligibility_override(target.id,member_roper,'office','unpaid','Bypass test');
    raise exception 'Office approved an exception';
  exception when others then
    if sqlerrm <> 'Entry Office cannot approve exceptions or bypass the cash ledger' then raise; end if;
  end;
  begin
    perform public.create_event_entry(target.id,member_roper,'office','comped');
    raise exception 'Office comped an entry';
  exception when others then
    if sqlerrm <> 'Entry Office cannot approve exceptions or bypass the cash ledger' then raise; end if;
  end;
  created_entry := public.create_event_entry(target.id,member_roper,'office','unpaid');
  perform public.set_entry_options(created_entry,'{}');
  perform public.set_event_contestant_check_in(target.event_id,member_roper,true);
  perform public.record_event_cash_payment(target.event_id,member_roper,1,'Rollback office test');
  begin
    perform public.record_event_cash_payment(other_event,member_roper,1,'Unauthorized test');
    raise exception 'Office recorded payment in an unassigned event';
  exception when others then
    if sqlerrm <> 'You do not have permission to record payments for this event' then raise; end if;
  end;
  update public.classifications set id=id where producer_id=target.producer_id;
  if found then raise exception 'Office edited classifications'; end if;
  update public.producer_funds set id=id where producer_id=target.producer_id;
  if found then raise exception 'Office edited funds'; end if;
  update public.competition_runs set id=id where producer_id=target.producer_id;
  if found then raise exception 'Office edited runs'; end if;
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  perform public.assign_staff_event(target.producer_id,target.event_id,office_user,false);
  perform set_config('request.jwt.claim.sub',office_user::text,true);
  if public.can_enter_event(target.event_id) then raise exception 'Revoked assignment retains office access'; end if;
end;
$$;
rollback;
