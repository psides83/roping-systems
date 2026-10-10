-- Rollback-only tests: no sample entries or fees are retained.
begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text from public.producer_staff where role='owner' order by created_at,user_id limit 1),true);
do $$
declare r public.event_ropings%rowtype; w1 uuid; w2 uuid; e uuid; submission uuid; before_entries integer; before_charges integer; before_runs integer; guest jsonb;
begin
  select er.* into r from public.event_ropings er join public.divisions d on d.id=er.division_id
    where public.can_manage_event(er.event_id) and er.event_day_status<>'completed' and er.name ilike '%Open%' and d.name ilike '%Tie%'
    and not exists(select 1 from public.roping_entries where event_roping_id=er.id) order by er.scheduled_date desc limit 1;
  if r.id is null then raise exception 'Empty Open Tie-down fixture required'; end if;
  update public.event_ropings set allow_non_members=true where id=r.id;
  perform public.set_roping_entry_limit(r.id,1);
  select count(*) into before_entries from public.roping_entries where event_id=r.event_id;
  select count(*) into before_charges from public.entry_charges where event_id=r.event_id;
  select count(*) into before_runs from public.competition_runs where event_roping_id=r.id;
  guest:=jsonb_build_object('firstName','Waitlist','lastName','First','email','waitlist-first@example.test','phone','5555550101','birthDate','1990-01-01','competitionGender','female');
  w1:=public.join_roping_waitlist(r.id,null,guest,'{}',null);
  w2:=public.join_roping_waitlist(r.id,null,guest||jsonb_build_object('lastName','Second','email','waitlist-second@example.test'),'{}',null);
  if (select count(*) from public.roping_entries where event_id=r.event_id)<>before_entries or (select count(*) from public.entry_charges where event_id=r.event_id)<>before_charges or (select count(*) from public.competition_runs where event_roping_id=r.id)<>before_runs then raise exception 'Waitlist created competition or financial records'; end if;
  begin perform public.resolve_roping_waitlist(w2,1,'offer',''); raise exception 'Queue skipped'; exception when raise_exception then if sqlerrm='Queue skipped' then raise; end if; end;
  perform public.resolve_roping_waitlist(w1,1,'offer','Contacted contestant');
  begin
    perform public.create_guest_event_entry_v2_with_eligibility_override(r.id,'Direct','Blocked','direct-capacity@example.test','','1990-01-01','female','unpaid',null);
    raise exception 'Direct entry stole reserved space';
  exception when raise_exception then if sqlerrm='Direct entry stole reserved space' then raise; end if; end;
  begin perform public.resolve_roping_waitlist(w2,1,'offer',''); raise exception 'Reserved space overbooked'; exception when raise_exception then if sqlerrm='Reserved space overbooked' then raise; end if; end;
  begin perform public.resolve_roping_waitlist(w1,1,'accept',''); raise exception 'Stale revision accepted'; exception when raise_exception then if sqlerrm='Stale revision accepted' then raise; end if; end;
  update public.roping_waitlist set option_ids=array[gen_random_uuid()] where id=w1;
  begin perform public.resolve_roping_waitlist(w1,2,'accept',''); raise exception 'Missing option accepted'; exception when raise_exception then if sqlerrm='Missing option accepted' then raise; end if; end;
  if (select status from public.roping_waitlist where id=w1)<>'offered' or (select count(*) from public.roping_entries where event_id=r.event_id)<>before_entries or (select count(*) from public.entry_charges where event_id=r.event_id)<>before_charges then raise exception 'Failed confirmation left partial records'; end if;
  update public.roping_waitlist set option_ids='{}' where id=w1;
  e:=public.resolve_roping_waitlist(w1,2,'accept','Contestant accepted');
  if e is null or (select payment_status from public.roping_entries where id=e)<>'unpaid' then raise exception 'Accepted entry missing or charged as paid'; end if;
  begin perform public.resolve_roping_waitlist(w2,1,'offer',''); raise exception 'Accepted space overbooked'; exception when raise_exception then if sqlerrm='Accepted space overbooked' then raise; end if; end;
  perform public.set_roping_entry_limit(r.id,2);
  perform public.resolve_roping_waitlist(w2,1,'offer','');
  begin perform public.set_roping_entry_limit(r.id,1); raise exception 'Limit ignored reservation'; exception when raise_exception then if sqlerrm='Limit ignored reservation' then raise; end if; end;
  perform public.resolve_roping_waitlist(w2,2,'decline','Contestant declined');
  perform public.set_roping_entry_limit(r.id,1);
  perform public.set_roping_entry_limit(r.id,3);
  insert into public.online_entry_submissions(producer_id,event_id,first_name,last_name,email,birth_date,competition_gender)
    values(r.producer_id,r.event_id,'Online','Waitlist','online-waitlist@example.test','1990-01-01','female') returning id into submission;
  insert into public.online_entry_submission_ropings(producer_id,submission_id,event_roping_id,quantity) values(r.producer_id,submission,r.id,2);
  if public.waitlist_online_submission(submission,1)<>2 then raise exception 'Multiple entries not individually waitlisted'; end if;
  if (select status from public.online_entry_submissions where id=submission)<>'waitlisted' then raise exception 'Portal request not waitlisted'; end if;
  select id into w1 from public.roping_waitlist where submission_id=submission order by created_at,id limit 1;
  select id into w2 from public.roping_waitlist where submission_id=submission order by created_at desc,id desc limit 1;
  perform public.resolve_roping_waitlist(w1,1,'offer','');
  e:=public.resolve_roping_waitlist(w1,2,'accept','Accepted by contestant');
  if (select source from public.roping_entries where id=e)<>'online' then raise exception 'Online entry origin lost'; end if;
  if (select status from public.online_entry_submissions where id=submission)<>'waitlisted' then raise exception 'Partial request marked complete'; end if;
  perform public.resolve_roping_waitlist(w2,1,'cancel','Contestant no longer needs second entry');
  if (select status from public.online_entry_submissions where id=submission)<>'accepted' then raise exception 'Completed request status not synchronized'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  begin perform public.set_roping_entry_limit(r.id,3); raise exception 'Unauthorized limit accepted'; exception when raise_exception then if sqlerrm='Unauthorized limit accepted' then raise; end if; end;
end $$;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.roping_waitlist) then raise exception 'Unrelated staff can read waitlist contact details'; end if;
end $$;
reset role;
rollback;
