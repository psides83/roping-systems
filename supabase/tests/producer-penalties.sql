begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.producer_staff
where producer_id='8f96f20f-932b-45ae-ac93-9832818de64d' and role='owner' order by created_at limit 1),true);
create temporary table penalty_test_run(id uuid) on commit drop;
do $$
declare
  sample record;
  class_id uuid;
  universal uuid;
  filtered uuid;
  options jsonb;
  rejected boolean;
begin
  select run.id,run.producer_id,run.entry_id,run.status,r.id roping_id,r.event_id,r.division_id,r.scheduled_date,
    r.timer_count,e.roper_id,e.membership_id into sample
  from public.competition_runs run join public.event_ropings r on r.id=run.event_roping_id
  join public.events event on event.id=r.event_id join public.roping_entries e on e.id=run.entry_id
  where event.slug='test-suite-v1-weekend-1' and event.producer_id='8f96f20f-932b-45ae-ac93-9832818de64d'
    and e.membership_id is not null and r.competition_format='standard' and run.status='complete'
  order by run.id limit 1;
  if sample.id is null then raise exception 'Missing test fixture'; end if;
  insert into penalty_test_run values(sample.id);
  select h.classification_id into class_id from public.membership_classification_history h
  where h.membership_id=sample.membership_id and h.division_id=sample.division_id and h.effective_on<=sample.scheduled_date
    and (h.ended_on is null or h.ended_on>=sample.scheduled_date)
  order by h.effective_on desc,h.created_at desc limit 1;
  if class_id is null then raise exception 'Missing classification fixture'; end if;
  update public.ropers set birth_date=(sample.scheduled_date-interval '19 years')::date where id=sample.roper_id;
  insert into public.producer_penalty_rules(producer_id,division_id,name,seconds)
    values(sample.producer_id,sample.division_id,'Test barrier',5) returning id into universal;
  insert into public.producer_penalty_rules(producer_id,division_id,name,seconds,classification_mode,classification_ids,age_mode,minimum_age,maximum_age)
    values(sample.producer_id,sample.division_id,'Test conditional',2,'only',array[class_id],'only',19,19) returning id into filtered;
  options:=public.applicable_run_penalties(sample.id);
  if not options @> jsonb_build_array(jsonb_build_object('id',filtered::text)) then raise exception 'Inclusive age/classification rule did not match'; end if;
  update public.producer_penalty_rules set age_mode='except' where id=filtered;
  if public.applicable_run_penalties(sample.id) @> jsonb_build_array(jsonb_build_object('id',filtered::text)) then raise exception 'Age exclusion was ignored'; end if;
  update public.producer_penalty_rules set age_mode='all',classification_mode='except' where id=filtered;
  if public.applicable_run_penalties(sample.id) @> jsonb_build_array(jsonb_build_object('id',filtered::text)) then raise exception 'Classification exclusion was ignored'; end if;
  update public.producer_penalty_rules set classification_mode='only',age_mode='only' where id=filtered;
  update public.ropers set birth_date=null where id=sample.roper_id;
  if public.applicable_run_penalties(sample.id) @> jsonb_build_array(jsonb_build_object('id',filtered::text)) then raise exception 'Unknown age matched restricted rule'; end if;
  update public.ropers set birth_date=(sample.scheduled_date-interval '19 years')::date where id=sample.roper_id;
  update public.events set status='in_progress',result_status='unofficial' where id=sample.event_id;
  perform public.save_run_with_penalties(sample.id,array_fill(12.34::numeric,array[sample.timer_count]),array[universal::text,filtered::text],sample.status,'Penalty integration test');
  if (select penalty_seconds from public.competition_runs where id=sample.id)<>7 then raise exception 'Penalties did not add up'; end if;
  update public.producer_penalty_rules set seconds=8,is_active=false where id=universal;
  options:=public.applicable_run_penalties(sample.id);
  if not options @> jsonb_build_array(jsonb_build_object('id',universal::text,'seconds',5)) then raise exception 'Saved penalty snapshot changed'; end if;
  rejected:=false;
  begin
    perform public.save_run_with_penalties(sample.id,array_fill(12.34::numeric,array[sample.timer_count]),array[gen_random_uuid()::text],sample.status,'Invalid penalty test');
  exception when others then
    if sqlerrm like 'A selected penalty no longer applies%' then rejected:=true; else raise; end if;
  end;
  if not rejected then raise exception 'Invalid penalty was accepted'; end if;
  rejected:=false;
  begin
    perform public.save_run_with_penalties(sample.id,array_fill(12.34::numeric,array[sample.timer_count]),array[filtered::text,filtered::text],sample.status,'Duplicate penalty test');
  exception when others then
    if sqlerrm like 'A penalty cannot be applied more than once%' then rejected:=true; else raise; end if;
  end;
  if not rejected then raise exception 'Duplicate penalty was accepted'; end if;
  perform public.save_run_with_penalties(sample.id,'{}',array[filtered::text],'no_time','No-time penalty test');
  if (select penalty_seconds<>0 or applied_penalties<>'[]' from public.competition_runs where id=sample.id) then raise exception 'No-time retained penalties'; end if;
  rejected:=false;
  begin
    update public.producer_penalty_rules set classification_ids=array[gen_random_uuid()] where id=filtered;
  exception when others then
    if sqlerrm like 'Choose classifications from this penalty division%' then rejected:=true; else raise; end if;
  end;
  if not rejected then raise exception 'Invalid classification was accepted'; end if;
end;
$$;
grant select on penalty_test_run to authenticated;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
set local role authenticated;
do $$
declare rejected boolean:=false;
begin
  if exists(select 1 from public.producer_penalty_rules) then raise exception 'Unrelated user can read penalty rules'; end if;
  begin
    perform public.applicable_run_penalties((select id from penalty_test_run));
  exception when others then
    if sqlerrm like 'You do not have permission%' then rejected:=true; else raise; end if;
  end;
  if not rejected then raise exception 'Unrelated user can view run penalty choices'; end if;
end;
$$;
reset role;
select 'Passed age/classification eligibility, stacking, historical snapshots, invalid choices, no-times and division validation' result;
rollback;
