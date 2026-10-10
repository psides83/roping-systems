begin;
do $$
declare staff uuid; producer uuid; producer_slug text; event_id uuid; event_slug text:=gen_random_uuid()::text;
  roping_id uuid; td uuid; person_id uuid:=gen_random_uuid(); entry_id uuid; member_id uuid;
  request_id uuid; rev integer; matches integer; submitted_email text:=gen_random_uuid()::text||'@example.com';
  waitlist_request uuid; request_revision integer; rejected boolean:=false;
begin
  select id into strict staff from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',staff::text,true);
  select id,slug into strict producer,producer_slug from public.producers where public.can_manage_organization(id) order by id limit 1;
  select id into strict td from public.divisions where producer_id=producer and gender_policy<>'women_only' limit 1;
  select coalesce(max(revision),0) into rev from public.producer_feature_preferences where producer_id=producer;
  perform public.save_producer_features(producer,rev,'{"require_memberships":false}');
  insert into public.events(producer_id,title,slug,starts_at,ends_at,status,publication_state,is_public)
    values(producer,'Roper search test',event_slug,now()+interval '1 day',now()+interval '2 days','entries_open','published',true)
    returning id into event_id;
  insert into public.event_ropings(producer_id,event_id,name,division_id,scheduled_date,main_round_count)
    values(producer,event_id,'Open search test',td,current_date+1,1) returning id into roping_id;
  insert into public.ropers(id,first_name,last_name,email,birth_date,competition_gender)
    values(person_id,'UniqueSearch','Roper',person_id::text||'@example.com','1980-01-01','female');
  entry_id:=public.create_event_entry_with_eligibility_override(roping_id,person_id,'office','unpaid',null);
  select membership_id into member_id from public.roping_entries where id=entry_id;
  perform set_config('request.jwt.claim.sub','',true);
  select count(*) into matches from public.search_event_roper_records(producer_slug,event_slug,'UniqueSearch');
  if matches<>1 then raise exception 'Public roper search did not find producer record'; end if;
  if exists(select 1 from public.search_event_roper_records('not-a-producer',event_slug,'UniqueSearch'))
    or exists(select 1 from public.search_event_roper_records(producer_slug,event_slug,'Un')) then raise exception 'Search scope or minimum query failed'; end if;
  request_id:=public.submit_online_entry_request_v4(producer_slug,event_slug,'UniqueSearch','Roper',
    submitted_email,'2545550111','2000-01-01','male','',null,
    jsonb_build_array(jsonb_build_object('divisionId',roping_id,'quantity',1,'optionIds','[]'::jsonb)),member_id);
  if not exists(select 1 from public.online_entry_submissions where id=request_id
    and requested_membership_id=member_id and membership_id is null and roper_id is null)
    then raise exception 'A search selection incorrectly linked identity before staff review'; end if;
  if exists(select 1 from public.ropers where id=person_id and auth_user_id is not null)
    then raise exception 'Search claimed a roper account'; end if;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  if public.review_online_entry_request_with_eligibility_override(request_id,'accepted','Staff verified selected roper',false)<>1
    then raise exception 'Selected record could not be entered'; end if;
  if (select count(*) from public.memberships where producer_id=producer and roper_id=person_id)<>1
    or (select count(*) from public.roping_entries where event_roping_id=roping_id and roper_id=person_id)<>2
    then raise exception 'Selected roper record was duplicated'; end if;
  if not exists(select 1 from public.ropers where id=person_id and email=person_id::text||'@example.com'
    and birth_date='1980-01-01' and competition_gender='female') then raise exception 'Public request overwrote existing roper details'; end if;
  begin
    perform public.create_guest_event_entry_v2_with_eligibility_override(roping_id,'Different','Contestant',
      person_id::text||'@example.com',null,'1990-01-01','female','unpaid',null);
  exception when others then
    if sqlerrm not like 'This email belongs to a different roper record.%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Email alone attached a different contestant'; end if;
  waitlist_request:=public.submit_online_entry_request_v4(producer_slug,event_slug,'UniqueSearch','Roper',
    gen_random_uuid()::text||'@example.com',null,'2000-01-01','male','',null,
    jsonb_build_array(jsonb_build_object('divisionId',roping_id,'quantity',1,'optionIds','[]'::jsonb)),member_id);
  select revision into request_revision from public.online_entry_submissions where id=waitlist_request;
  matches:=public.waitlist_online_submission(waitlist_request,request_revision);
  if matches<>1 or not exists(select 1
    from public.roping_waitlist where submission_id=waitlist_request and roper_id=person_id and guest is null)
    then raise exception 'Waitlisting lost the selected roper record'; end if;
  if has_function_privilege('anon','public.event_entry_competition_holds(uuid)','execute') then raise exception 'Private hold lookup exposed'; end if;
end $$;
rollback;
