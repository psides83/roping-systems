begin;
do $$
declare
  p uuid:='8f96f20f-932b-45ae-ac93-9832818de64d'; r record; w uuid; n integer; initial_class uuid;
  entered_class uuid; higher_class uuid; higher_rule uuid; entered_rule uuid; strict_rule uuid;
begin
  perform set_config('request.jwt.claim.sub',(select user_id::text from public.producer_staff where producer_id=p and role='owner' limit 1),true);
  select run.id,h.classification_id,er.division_id,e.membership_id,run.entry_id into r
    from public.competition_runs run join public.event_ropings er on er.id=run.event_roping_id
    join public.roping_entries e on e.id=run.entry_id join public.classifications c on c.id=er.classification_id
    join public.events event on event.id=er.event_id
    join public.membership_classification_history h on h.membership_id=e.membership_id and h.division_id=er.division_id
      and h.effective_on<=er.scheduled_date and (h.ended_on is null or h.ended_on>=er.scheduled_date)
    where run.producer_id=p and event.slug='test-suite-v2-live' and c.eligibility_type='skill' and e.membership_id is not null and e.competition_status='active' limit 1;
  if r.id is null then raise exception 'Retained test run missing'; end if;
  select classification_id into initial_class from public.membership_classification_history where membership_id=r.membership_id and division_id=r.division_id and ended_on is null;
  insert into public.classification_watch_rules(producer_id,division_id,classification_id,name,threshold_seconds,review_count,time_basis)
    values(p,r.division_id,r.classification_id,'Rollback test rule',10,3,'raw') returning id into w;
  update public.producers set classification_watch_enabled=false where id=p;
  update public.competition_runs set status='complete',raw_time_seconds=9 where id=r.id;
  if exists(select 1 from public.classification_run_flags where rule_id=w) then raise exception 'Disabled watch generated a flag'; end if;
  update public.producers set classification_watch_enabled=true where id=p;
  update public.competition_runs set raw_time_seconds=10 where id=r.id;
  if not exists(select 1 from public.classification_run_flags where rule_id=w and is_active and measured_seconds=10) then raise exception 'Inclusive threshold failed'; end if;
  update public.competition_runs set raw_time_seconds=9.5 where id=r.id;
  select count(*) into n from public.classification_run_flags where rule_id=w;
  if n<>1 then raise exception 'Same run counted twice'; end if;
  update public.classification_watch_rules set threshold_seconds=8,inclusive=false where id=w;
  update public.competition_runs set raw_time_seconds=9.4 where id=r.id;
  if not exists(select 1 from public.classification_run_flags where rule_id=w and is_active and (rule_snapshot->>'threshold_seconds')::numeric=10) then raise exception 'Existing evidence lost its rule snapshot'; end if;
  update public.competition_runs set status='no_time' where id=r.id;
  if exists(select 1 from public.classification_run_flags where rule_id=w and is_active) then raise exception 'No-time correction left an active flag'; end if;
  update public.competition_runs set status='complete',raw_time_seconds=9 where id=r.id;
  perform public.acknowledge_classification_watch(r.membership_id,r.division_id,'Staff reviewed the evidence; retain current number');
  update public.competition_runs set raw_time_seconds=8.9 where id=r.id;
  if exists(select 1 from public.classification_run_flags where rule_id=w and reviewed_at is null) then raise exception 'Correction reopened a staff-reviewed occurrence'; end if;
  if initial_class is distinct from (select classification_id from public.membership_classification_history where membership_id=r.membership_id and division_id=r.division_id and ended_on is null) then raise exception 'Watch changed the member classification automatically'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.acknowledge_classification_watch(r.membership_id,r.division_id,'Unauthorized review');
    raise exception 'Unrelated user reviewed a watch flag';
  exception when others then if sqlerrm='Unrelated user reviewed a watch flag' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',(select user_id::text from public.producer_staff where producer_id=p and role='owner' limit 1),true);
  delete from public.classification_watch_rules where id=w;
  if not exists(select 1 from public.classification_run_flags where run_id=r.id and rule_id is null and not is_active and cleared_reason='Rule deleted') then raise exception 'Deleting a rule lost its evidence'; end if;
  select er.classification_id into entered_class from public.roping_entries e join public.event_ropings er on er.id=e.event_roping_id where e.id=r.entry_id;
  select c.id into higher_class from public.classifications c join public.classifications entered on entered.id=entered_class
    where c.producer_id=p and c.division_id=r.division_id and c.eligibility_type='skill' and c.rank>entered.rank order by c.rank desc limit 1;
  if higher_class is null then raise exception 'Entered-down fixture requires a higher member number'; end if;
  update public.membership_classification_history set classification_id=higher_class
    where membership_id=r.membership_id and division_id=r.division_id;
  insert into public.classification_watch_rules(producer_id,division_id,classification_id,name,threshold_seconds,time_basis)
    values(p,r.division_id,higher_class,'Member number threshold',10,'raw') returning id into higher_rule;
  insert into public.classification_watch_rules(producer_id,division_id,classification_id,name,threshold_seconds,time_basis)
    values(p,r.division_id,entered_class,'Entered number must not apply',20,'raw') returning id into entered_rule;
  update public.competition_runs set raw_time_seconds=9 where id=r.id;
  if not exists(select 1 from public.classification_run_flags where rule_id=higher_rule and is_active)
    or exists(select 1 from public.classification_run_flags where rule_id=entered_rule) then
    raise exception 'Entered-down watch did not follow the member classification'; end if;
  insert into public.classification_watch_rules(producer_id,division_id,classification_id,name,threshold_seconds,time_basis,inclusive)
    values(p,r.division_id,higher_class,'Strict final threshold',10,'final',false) returning id into strict_rule;
  update public.roping_entries set handicap_time_credit_seconds=0 where id=r.entry_id;
  update public.competition_runs set raw_time_seconds=8,penalty_seconds=2 where id=r.id;
  if exists(select 1 from public.classification_run_flags where rule_id=strict_rule) then raise exception 'Strict final threshold included equal time'; end if;
  update public.competition_runs set raw_time_seconds=7.99 where id=r.id;
  if not exists(select 1 from public.classification_run_flags where rule_id=strict_rule and measured_seconds=9.99 and is_active) then raise exception 'Final threshold ignored penalties or hundredths'; end if;
  update public.producers set classification_watch_enabled=false where id=p;
  update public.competition_runs set status='no_time' where id=r.id;
  if exists(select 1 from public.classification_run_flags where run_id=r.id and is_active) then raise exception 'Disabling watch prevented correction of existing flags'; end if;
end $$;
select 'Watch disabled state, member-based entered-down rules, strict/final thresholds, snapshots, corrections, idempotence, staff decisions, and permission checks passed' as result;
rollback;
