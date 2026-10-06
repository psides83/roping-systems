begin;
do $$
declare
  p uuid:='8f96f20f-932b-45ae-ac93-9832818de64d'; actor uuid; fixture record; target uuid; other_division_class uuid;
  rule uuid; flag uuid; second_flag uuid; second_run uuid; reference uuid:=gen_random_uuid(); moved uuid; retried uuid;
  evidence_date date; date_on date; original_run jsonb; original_entry jsonb; rejected boolean;
begin
  select user_id into actor from public.producer_staff where producer_id=p and role='owner' limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  select run.id,run.entry_id,h.id assignment_id,h.classification_id,h.effective_on,e.membership_id,er.division_id,er.scheduled_date
    into fixture from public.competition_runs run
    join public.roping_entries e on e.id=run.entry_id
    join public.event_ropings er on er.id=run.event_roping_id
    join public.events event on event.id=er.event_id
    join public.membership_classification_history h on h.membership_id=e.membership_id and h.division_id=er.division_id
      and h.ended_on is null and h.effective_on<=er.scheduled_date
    join public.classifications c on c.id=h.classification_id
    where event.slug='test-suite-v2-live' and event.producer_id=p and c.eligibility_type='skill' limit 1;
  if fixture.id is null then raise exception 'Live member fixture missing'; end if;
  select id into target from public.classifications where producer_id=p and division_id=fixture.division_id
    and is_active and eligibility_type='skill' and id<>fixture.classification_id order by rank limit 1;
  select id into other_division_class from public.classifications where producer_id=p and division_id<>fixture.division_id and is_active limit 1;
  date_on:=greatest(fixture.effective_on,fixture.scheduled_date);
  insert into public.classification_watch_rules(producer_id,division_id,classification_id,name,threshold_seconds,time_basis)
    values(p,fixture.division_id,fixture.classification_id,'Approval test evidence',999,'raw') returning id into rule;
  update public.producers set classification_watch_enabled=true where id=p;
  update public.competition_runs set status='complete',raw_time_seconds=9.87 where id=fixture.id;
  select id,occurred_on into flag,evidence_date from public.classification_run_flags where rule_id=rule and run_id=fixture.id;
  if flag is null then raise exception 'Watch evidence not generated'; end if;
  select id into second_run from public.competition_runs where entry_id=fixture.entry_id and id<>fixture.id limit 1;
  if second_run is null then raise exception 'Second run fixture missing'; end if;
  update public.competition_runs set status='complete',raw_time_seconds=9.88 where id=second_run;
  select id into second_flag from public.classification_run_flags where rule_id=rule and run_id=second_run;

  rejected:=false;
  begin
    perform public.approve_classification_watch(p,fixture.membership_id,fixture.division_id,fixture.assignment_id,
      other_division_class,date_on,'Reject wrong division',array[flag],gen_random_uuid());
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Approved a different division'; end if;
  rejected:=false;
  begin
    perform public.approve_classification_watch(p,fixture.membership_id,fixture.division_id,fixture.assignment_id,
      fixture.classification_id,date_on,'Reject same classification',array[flag],gen_random_uuid());
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Approved the current classification again'; end if;
  rejected:=false;
  begin
    perform public.approve_classification_watch(p,fixture.membership_id,fixture.division_id,gen_random_uuid(),
      target,date_on,'Reject stale assignment',array[flag],gen_random_uuid());
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Approved stale assignment'; end if;
  rejected:=false;
  begin
    perform public.approve_classification_watch(p,fixture.membership_id,fixture.division_id,fixture.assignment_id,
      target,evidence_date-1,'Reject backdated move',array[flag],gen_random_uuid());
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Approved move preceding reviewed evidence'; end if;
  update public.competition_runs set status='no_time' where id=fixture.id;
  rejected:=false;
  begin
    perform public.approve_classification_watch(p,fixture.membership_id,fixture.division_id,fixture.assignment_id,
      target,date_on,'Reject corrected evidence',array[flag],gen_random_uuid());
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Approved corrected evidence'; end if;
  update public.competition_runs set status='complete' where id=fixture.id;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  rejected:=false;
  begin
    perform public.approve_classification_watch(p,fixture.membership_id,fixture.division_id,fixture.assignment_id,
      target,date_on,'Reject unrelated staff',array[flag],gen_random_uuid());
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Unrelated user approved a move'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  select to_jsonb(run) into original_run from public.competition_runs run where id=fixture.id;
  select to_jsonb(entry) into original_entry from public.roping_entries entry where id=fixture.entry_id;
  moved:=public.approve_classification_watch(p,fixture.membership_id,fixture.division_id,fixture.assignment_id,
    target,date_on,'Staff approved this move after reviewing the run',array[flag],reference);
  if not exists(select 1 from public.membership_classification_history where id=moved and classification_id=target
    and effective_on=date_on and assigned_by=actor and ended_on is null) then raise exception 'Assignment was not created'; end if;
  if not exists(select 1 from public.membership_classification_history where id=fixture.assignment_id and ended_on=date_on
    and ended_by=actor) then raise exception 'Previous assignment not retained'; end if;
  if not exists(select 1 from public.membership_classification_reviews where id=reference and status='approved'
    and current_classification_id=fixture.classification_id and proposed_classification_id=target and approved_assignment_id=moved
    and created_by=actor and resolved_by=actor) then raise exception 'Approved review was not linked to the move'; end if;
  if not exists(select 1 from public.classification_run_flags where id=flag and review_id=reference
    and reviewed_by=actor and reviewed_at is not null) then raise exception 'Run evidence was not linked to approval'; end if;
  if not exists(select 1 from public.classification_run_flags where id=second_flag and reviewed_at is null) then raise exception 'Unselected run evidence was silently reviewed'; end if;
  if original_run is distinct from (select to_jsonb(run) from public.competition_runs run where id=fixture.id)
    or original_entry is distinct from (select to_jsonb(entry) from public.roping_entries entry where id=fixture.entry_id) then
    raise exception 'Approval changed existing competition data'; end if;
  retried:=public.approve_classification_watch(p,fixture.membership_id,fixture.division_id,fixture.assignment_id,
    target,date_on,'Staff approved this move after reviewing the run',array[flag],reference);
  if retried<>moved then raise exception 'Retry created a duplicate move'; end if;
  rejected:=false;
  begin
    perform public.approve_classification_watch(p,fixture.membership_id,fixture.division_id,fixture.assignment_id,
      target,date_on,'Staff approved this move after reviewing the run',array[flag],gen_random_uuid());
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Already-approved evidence created another move'; end if;
end $$;
select 'Atomic approval, assignment/review/evidence history, stale-data guards, permissions, idempotence, and unchanged competition data passed' as result;
rollback;
