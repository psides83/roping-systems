begin;
do $$
declare staff uuid; producer uuid; event_id uuid; roping_id uuid; numbered_id uuid;
  td uuid; number_class uuid; person_id uuid:=gen_random_uuid(); member_id uuid;
  first_entry uuid; second_entry uuid; rev integer; blocked boolean; hold text;
  pending_person uuid:=gen_random_uuid(); pending_entry uuid;
  handicap_id uuid; handicap_entry uuid; handicap_class uuid; ba uuid; credit numeric;
  staff_record_person uuid:=gen_random_uuid();
begin
  select id into strict staff from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',staff::text,true);
  select id into strict producer from public.producers where public.can_manage_organization(id) order by id limit 1;
  select c.division_id,c.id into strict td,number_class from public.classifications c
    join public.divisions d on d.id=c.division_id where c.producer_id=producer
    and c.eligibility_type='skill' and d.gender_policy<>'women_only' order by c.rank desc limit 1;
  insert into public.events(producer_id,title,slug,starts_at,ends_at,status,publication_state,is_public)
    values(producer,'Membership clearance test',gen_random_uuid()::text,now(),now()+interval '1 day','draft','unpublished',false)
    returning id into event_id;
  insert into public.event_ropings(producer_id,event_id,name,division_id,scheduled_date,main_round_count)
    values(producer,event_id,'Open clearance test',td,current_date,1) returning id into roping_id;
  insert into public.event_ropings(producer_id,event_id,name,division_id,classification_id,scheduled_date,main_round_count)
    values(producer,event_id,'Numbered clearance test',td,number_class,current_date,1) returning id into numbered_id;
  insert into public.ropers(id,first_name,last_name,email,birth_date,competition_gender)
    values(person_id,'Morgan','Clearance',person_id::text||'@example.com','1990-01-01','female');
  select coalesce(max(revision),0) into rev from public.producer_feature_preferences where producer_id=producer;
  perform public.save_producer_features(producer,rev,'{"require_memberships":false}'); rev:=rev+1;
  insert into public.ropers(id,first_name,last_name,competition_gender)
    values(staff_record_person,'StaffAdded','Informal','female');
  insert into public.memberships(producer_id,roper_id,member_number,status)
    values(producer,staff_record_person,'STAFF-'||staff_record_person::text,'active');
  if exists(select 1 from public.memberships where roper_id=staff_record_person and formally_approved)
    then raise exception 'Staff-created informal record was formally approved'; end if;
  first_entry:=public.create_event_entry_with_eligibility_override(roping_id,person_id,'office','unpaid',null);
  select membership_id into member_id from public.roping_entries where id=first_entry;
  if member_id is null or not exists(select 1 from public.memberships where id=member_id and status='active' and not formally_approved)
    then raise exception 'First entry did not create an informal roper record'; end if;
  if public.entry_competition_hold(first_entry) is not null then raise exception 'Informal Open entry incorrectly held'; end if;
  second_entry:=public.create_event_entry_with_eligibility_override(numbered_id,person_id,'office','unpaid',null);
  if (select membership_id from public.roping_entries where id=second_entry)<>member_id
    or (select count(*) from public.memberships where producer_id=producer and roper_id=person_id)<>1
    then raise exception 'Repeated entry duplicated the roper record'; end if;
  hold:=public.entry_competition_hold(second_entry);
  if hold is null or hold not like 'Classification or eligibility review required:%' then raise exception 'Missing classification was not held'; end if;
  blocked:=false;
  begin update public.competition_runs set status='no_time' where entry_id=second_entry;
  exception when others then
    if sqlerrm not like 'Classification or eligibility review required:%' then raise; end if;
    blocked:=true;
  end;
  if not blocked then raise exception 'Unclassified roper competed'; end if;
  insert into public.membership_classification_history(producer_id,membership_id,division_id,classification_id,effective_on,reason,assigned_by)
    values(producer,member_id,td,number_class,current_date,'Staff confirmed classification',staff);
  if public.entry_competition_hold(second_entry) is not null then raise exception 'Confirmed classification did not clear hold'; end if;
  select a.classification_id,a.handicap_time_credit_seconds,r.division_id into handicap_class,credit,ba
    from public.event_roping_handicap_adjustments a join public.event_ropings r on r.id=a.event_roping_id
    where r.producer_id=producer and r.division_id<>td order by abs(a.handicap_time_credit_seconds) desc limit 1;
  if handicap_class is null then raise exception 'Handicap fixture required'; end if;
  insert into public.event_ropings(producer_id,event_id,name,division_id,scheduled_date,competition_format,incentive_enabled)
    values(producer,event_id,'Handicap clearance test',ba,current_date,'handicap',true) returning id into handicap_id;
  insert into public.event_roping_handicap_adjustments(producer_id,event_id,event_roping_id,classification_id,handicap_time_credit_seconds)
    values(producer,event_id,handicap_id,handicap_class,credit);
  handicap_entry:=public.create_event_entry_with_eligibility_override(handicap_id,person_id,'office','unpaid',null);
  if public.entry_competition_hold(handicap_entry) is null then raise exception 'Unclassified Handicap entry cleared'; end if;
  insert into public.membership_classification_history(producer_id,membership_id,division_id,classification_id,effective_on,reason,assigned_by)
    values(producer,member_id,ba,handicap_class,current_date,'Staff confirmed Handicap classification',staff);
  if not exists(select 1 from public.roping_entries where id=handicap_entry
    and handicap_classification_id=handicap_class and handicap_time_credit_seconds=credit)
    then raise exception 'Handicap confirmation did not refresh the copied adjustment'; end if;
  if public.entry_competition_hold(handicap_entry) is not null then raise exception 'Confirmed Handicap entry stayed held'; end if;
  perform public.save_producer_features(producer,rev,'{"require_memberships":true}'); rev:=rev+1;
  if public.entry_competition_hold(first_entry)<>'Membership approval required before competing'
    then raise exception 'Enabling memberships silently approved an informal record'; end if;
  insert into public.ropers(id,first_name,last_name,email,competition_gender)
    values(pending_person,'Pending','Applicant',pending_person::text||'@example.com','female');
  pending_entry:=public.create_event_entry_with_eligibility_override(roping_id,pending_person,'office','unpaid',null);
  if not exists(select 1 from public.roping_entries e join public.memberships m on m.id=e.membership_id
    where e.id=pending_entry and m.status='pending' and not m.formally_approved)
    then raise exception 'Early registration did not retain pending membership'; end if;
  if public.entry_competition_hold(pending_entry)<>'Membership approval required before competing'
    then raise exception 'Pending member was cleared to compete'; end if;
  update public.memberships set status='active' where id=member_id;
  if public.entry_competition_hold(first_entry) is not null then raise exception 'Explicit membership approval did not clear hold'; end if;
  update public.memberships set expires_on=current_date-1 where id=member_id;
  if public.entry_competition_hold(first_entry) is null then raise exception 'Expired membership cleared'; end if;
  perform public.save_producer_features(producer,rev,'{"require_memberships":false}');
  if public.entry_competition_hold(first_entry) is not null then raise exception 'Expiration applied to informal roper mode'; end if;
  if has_function_privilege('anon','public.event_entry_competition_holds(uuid)','execute')
    or has_function_privilege('authenticated','public.entry_competition_hold(uuid)','execute')
    then raise exception 'Private eligibility helpers exposed'; end if;
end $$;
rollback;
