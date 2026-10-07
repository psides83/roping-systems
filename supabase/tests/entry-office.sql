begin;
do $$
declare platform_user uuid; office_user uuid := gen_random_uuid(); target record;
  member_roper uuid; invitation uuid; created_entry uuid; other_event uuid;
  guest_entry uuid; request_id uuid:=gen_random_uuid(); decline_id uuid:=gen_random_uuid(); guest_email text:=gen_random_uuid()::text||'@example.com';
begin
  select id into strict platform_user from auth.users where lower(email)='psides83@hotmail.com';
  select r.id,r.producer_id,r.event_id into strict target from public.event_ropings r
    where r.event_id='0405a4f6-bdf6-49d6-af75-7f665006308b' and r.name ilike '%open%' order by r.id limit 1;
  select m.roper_id into strict member_roper from public.memberships m join public.ropers p on p.id=m.roper_id
    where m.producer_id=target.producer_id and m.status='active' and p.competition_gender='female'
    and not exists(select 1 from public.roping_entries e where e.event_roping_id=target.id and e.roper_id=m.roper_id)
    order by m.id limit 1;
  select id into strict other_event from public.events where id<>target.event_id order by id limit 1;
  update public.event_ropings set allow_non_members=true where id=target.id;
  insert into public.ropers(first_name,last_name,email,birth_date,competition_gender)
    values('Existing','Guest',guest_email,'1980-01-01','female');
  insert into public.online_entry_submissions(id,producer_id,event_id,first_name,last_name,email,birth_date,competition_gender)
    values(request_id,target.producer_id,target.event_id,'Online','Guest',gen_random_uuid()::text||'@example.com','1980-01-01','female'),
      (decline_id,target.producer_id,target.event_id,'Declined','Guest',gen_random_uuid()::text||'@example.com','1980-01-01','female');
  insert into public.online_entry_submission_ropings(producer_id,submission_id,event_roping_id,quantity)
    values(target.producer_id,request_id,target.id,1);
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
  begin
    perform public.transfer_event_entry_with_eligibility_override(created_entry,target.id,'Unauthorized office move',null);
    raise exception 'Office moved an entry';
  exception when others then
    if sqlerrm<>'You do not have permission to move this entry' then raise; end if;
  end;
  guest_entry:=public.create_guest_event_entry_v2_with_eligibility_override(target.id,'Guest','Office',guest_email,'2545550101','2010-01-01','male','unpaid',null);
  if not exists(select 1 from public.ropers where email=guest_email and birth_date='1980-01-01' and competition_gender='female') then
    raise exception 'Office changed existing guest eligibility facts'; end if;
  if public.review_online_entry_request_with_eligibility_override(request_id,'accepted','Eligible online guest',false)<>1 then raise exception 'Online entry not created'; end if;
  perform public.review_online_entry_request_with_eligibility_override(decline_id,'declined','Requested cancellation',false);
  begin
    perform public.review_online_entry_request_with_eligibility_override(decline_id,'accepted','Unauthorized override',true);
    raise exception 'Office approved online exception';
  exception when others then
    if sqlerrm<>'Entry Office cannot approve eligibility exceptions' then raise; end if;
  end;
  perform public.correct_event_roper_contact(target.event_id,member_roper,'corrected-'||office_user::text||'@example.com','(254) 555-0123','Roper confirmed correct contact');
  if not exists(select 1 from public.producer_audit_log where entity_id=member_roper and actor_user_id=office_user and after_data->>'reason'='Roper confirmed correct contact') then
    raise exception 'Contact correction audit missing'; end if;
  begin
    perform public.correct_event_roper_contact(other_event,member_roper,'wrong@example.com','2545550123','Wrong event contact');
    raise exception 'Office corrected unassigned event contact';
  exception when others then
    if sqlerrm<>'Entry access for this event is required' then raise; end if;
  end;
  begin
    perform public.manage_short_round_qualifier(target.id,created_entry,'added','Unauthorized finalist');
    raise exception 'Office changed short round field';
  exception when others then
    if sqlerrm<>'You do not have permission to manage this short round' then raise; end if;
  end;
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
  begin
    perform public.set_entry_options(created_entry,'{}');
    raise exception 'Revoked office changed an entry';
  exception when others then
    if sqlerrm<>'You do not have permission to update this entry' then raise; end if;
  end;
end;
$$;
rollback;
