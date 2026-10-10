begin;
do $$
declare
  staff uuid; producer uuid; division uuid; event uuid; first_roping uuid; second_roping uuid;
  person uuid := gen_random_uuid(); member uuid; rev integer; blocked boolean; result integer;
  high_class uuid; low_class uuid; high_roping uuid; low_roping uuid;
  age_class uuid; age_roping uuid;
  pending_roper uuid; pending_entry uuid; approved_member uuid; office uuid:=gen_random_uuid();
begin
  if (select provolatile from pg_proc where oid='public.walk_up_entry_eligibility(uuid,uuid)'::regprocedure)<>'v' then
    raise exception 'Eligibility RPC must support qualification shared locks in PostgREST';
  end if;
  select id into strict staff from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',staff::text,true);
  select id into strict producer from public.producers where public.can_manage_organization(id) order by id limit 1;
  select id into strict division from public.divisions where producer_id=producer and gender_policy<>'women_only' order by id limit 1;
  insert into public.events(producer_id,title,slug,starts_at,ends_at,status,publication_state)
    values(producer,'Walk-up transaction test',gen_random_uuid()::text,now(),now()+interval '1 day','draft','unpublished') returning id into event;
  insert into public.event_ropings(producer_id,event_id,division_id,name,scheduled_date,main_round_count,allow_non_members)
    values(producer,event,division,'First',current_date,1,true) returning id into first_roping;
  insert into public.event_ropings(producer_id,event_id,division_id,name,scheduled_date,main_round_count,allow_non_members)
    values(producer,event,division,'Second',current_date,1,true) returning id into second_roping;
  insert into public.ropers(id,first_name,last_name,competition_gender) values(person,'Alex','Walkup','female');
  insert into public.memberships(producer_id,roper_id,member_number,status)
    values(producer,person,person::text,'active') returning id into member;
  if (select count(*) from public.walk_up_entry_eligibility(event,person) where reason is null)<>2 then
    raise exception 'Open ropings did not pass eligibility preview';
  end if;
  blocked:=false;
  begin
    perform public.create_walk_up_entries(event,jsonb_build_array(
      jsonb_build_object('ropingId',first_roping,'optionIds','[]'::jsonb),
      jsonb_build_object('ropingId',gen_random_uuid(),'optionIds','[]'::jsonb)),person,null,'unpaid',false,null);
  exception when others then
    if sqlerrm <> 'Choose an available roping from this event' then raise; end if;
    blocked:=true;
  end;
  if not blocked or exists(select 1 from public.roping_entries where event_id=event) then
    raise exception 'Failed batch left a partial entry';
  end if;
  result:=public.create_walk_up_entries(event,jsonb_build_array(
    jsonb_build_object('ropingId',first_roping,'optionIds','[]'::jsonb),
    jsonb_build_object('ropingId',second_roping,'optionIds','[]'::jsonb)),person,null,'unpaid',false,null);
  if result<>2 or (select count(*) from public.roping_entries where event_id=event)<>2 then
    raise exception 'Multi-roping batch did not create both entries';
  end if;
  select coalesce(max(revision),0) into rev from public.producer_feature_preferences where producer_id=producer;
  perform public.save_producer_features(producer,rev,'{"require_memberships":true}');
  update public.event_ropings set allow_non_members=false where id=first_roping;
  result:=public.create_walk_up_entries(event,jsonb_build_array(jsonb_build_object('ropingId',first_roping,'optionIds','[]'::jsonb)),null,
    '{"firstName":"Pending","lastName":"Walkup","phone":"(254) 555-0102","email":"","birthDate":"","competitionGender":"female","membershipApproval":"pending"}', 'unpaid',false,null);
  select e.roper_id,e.id into pending_roper,pending_entry from public.roping_entries e
    join public.ropers r on r.id=e.roper_id where e.event_id=event and r.first_name='Pending';
  if result<>1 or public.entry_competition_hold(pending_entry)<>'Membership approval required before competing' then
    raise exception 'Pending paper applicant was not registered with a competition hold';
  end if;
  perform public.create_walk_up_entries(event,jsonb_build_array(jsonb_build_object('ropingId',first_roping,'optionIds','[]'::jsonb)),null,
    '{"firstName":"Approved","lastName":"Walkup","phone":"(254) 555-0103","email":"","birthDate":"","competitionGender":"female","membershipApproval":"approved"}', 'unpaid',false,null);
  select m.id into approved_member from public.memberships m join public.ropers r on r.id=m.roper_id
    where m.producer_id=producer and r.first_name='Approved' and r.last_name='Walkup' order by m.created_at desc limit 1;
  if not exists(select 1 from public.memberships where id=approved_member and formally_approved and status='active')
    or not exists(select 1 from public.producer_audit_log where entity_id=approved_member
      and after_data->>'paper_application_approved'='true' and actor_user_id=staff) then
    raise exception 'Paper membership approval or staff audit record missing';
  end if;
  if exists(select 1 from public.roping_entries e where e.membership_id=approved_member
    and public.entry_competition_hold(e.id) is not null) then raise exception 'Approved Open roper remained held'; end if;
  perform public.save_producer_features(producer,rev+1,'{"require_memberships":false}');
  result:=public.create_walk_up_entries(event,jsonb_build_array(
    jsonb_build_object('ropingId',first_roping,'optionIds','[]'::jsonb),
    jsonb_build_object('ropingId',second_roping,'optionIds','[]'::jsonb)),null,
    '{"firstName":"Guest","lastName":"Walkup","phone":"(254) 555-0102","email":"","birthDate":"","competitionGender":"female"}', 'unpaid',false,null);
  if result<>2 or (select count(distinct e.roper_id) from public.roping_entries e join public.ropers r on r.id=e.roper_id where e.event_id=event and r.first_name='Guest')<>1 then
    raise exception 'Guest batch duplicated the roper';
  end if;
  select c.id,c.division_id into high_class,division from public.classifications c
    join public.divisions d on d.id=c.division_id where c.producer_id=producer
      and c.eligibility_type='skill' and c.rank>0 and d.gender_policy<>'women_only'
    order by c.rank desc limit 1;
  select id into low_class from public.classifications where producer_id=producer
    and division_id=division and eligibility_type='skill' and rank>0 order by rank asc limit 1;
  if high_class is null or low_class is null or high_class=low_class then raise exception 'Numbered classification fixtures required'; end if;
  insert into public.event_ropings(producer_id,event_id,division_id,classification_id,name,scheduled_date,main_round_count)
    values(producer,event,division,high_class,'Higher number',current_date,1) returning id into high_roping;
  insert into public.event_ropings(producer_id,event_id,division_id,classification_id,name,scheduled_date,main_round_count)
    values(producer,event,division,low_class,'Lower number',current_date,1) returning id into low_roping;
  insert into public.membership_classification_history(producer_id,membership_id,division_id,classification_id,effective_on,reason,assigned_by)
    values(producer,member,division,high_class,current_date-2,'Walk-up eligibility test',staff);
  if not exists(select 1 from public.walk_up_entry_eligibility(event,person) where roping_id=low_roping and reason is null) then
    raise exception 'Higher-numbered roper could not enter down';
  end if;
  update public.membership_classification_history set ended_on=current_date-1 where membership_id=member and division_id=division;
  insert into public.membership_classification_history(producer_id,membership_id,division_id,classification_id,effective_on,reason,assigned_by)
    values(producer,member,division,low_class,current_date,'Walk-up eligibility test',staff);
  if not exists(select 1 from public.walk_up_entry_eligibility(event,person) where roping_id=high_roping and reason is not null) then
    raise exception 'Lower-numbered roper incorrectly offered higher-numbered roping';
  end if;
  insert into public.classifications(producer_id,division_id,name,eligibility_type,rank,maximum_age)
    values(producer,division,'Walk-up youth '||gen_random_uuid()::text,'age',0,19) returning id into age_class;
  insert into public.event_ropings(producer_id,event_id,division_id,classification_id,name,scheduled_date,main_round_count,allow_non_members)
    values(producer,event,division,age_class,'Youth',current_date,1,true) returning id into age_roping;
  if not exists(select 1 from public.walk_up_age_requirements(event) where roping_id=age_roping and age_required)
    or exists(select 1 from public.walk_up_age_requirements(event) where roping_id=first_roping and age_required) then
    raise exception 'Birth-date requirement is not scoped to age-based ropings';
  end if;
  if has_function_privilege('anon','public.create_walk_up_entries(uuid,jsonb,uuid,jsonb,public.payment_status,boolean,text)','execute') then
    raise exception 'Anonymous entry office access exposed';
  end if;
  perform public.save_producer_features(producer,rev+2,'{"require_memberships":true}');
  insert into auth.users(id,email) values(office,office::text||'@example.com');
  insert into public.producer_staff(producer_id,user_id,role) values(producer,office,'entry_office');
  perform public.assign_staff_event(producer,event,office,true);
  perform set_config('request.jwt.claim.sub',office::text,true);
  blocked:=false;
  begin
    perform public.create_walk_up_entries(event,jsonb_build_array(jsonb_build_object('ropingId',first_roping,'optionIds','[]'::jsonb)),null,
      '{"firstName":"Unauthorized","lastName":"Walkup","phone":"(254) 555-0104","email":"","birthDate":"","competitionGender":"female","membershipApproval":"approved"}', 'unpaid',false,null);
  exception when others then
    if sqlerrm<>'Membership-management access is required to approve a paper application' then raise; end if;
    blocked:=true;
  end;
  if not blocked then raise exception 'Entry office approved a membership without permission'; end if;
  perform public.create_walk_up_entries(event,jsonb_build_array(jsonb_build_object('ropingId',first_roping,'optionIds','[]'::jsonb)),null,
    '{"firstName":"Office","lastName":"Walkup","phone":"(254) 555-0105","email":"","birthDate":"","competitionGender":"female","membershipApproval":"pending"}', 'unpaid',false,null);
  if has_function_privilege('authenticated','public.approve_walk_up_paper_membership(uuid,uuid,uuid)','execute') then
    raise exception 'Private paper approval helper exposed';
  end if;
end $$;
rollback;
