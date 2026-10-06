create or replace function public.evaluate_classification_run_watch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; assignment record; rule record; snapshot jsonb; measured numeric; qualified boolean;
begin
  select e.membership_id,e.competition_status,e.handicap_time_credit_seconds,
    er.division_id,er.scheduled_date,er.event_id,p.classification_watch_enabled
  into r from public.roping_entries e
    join public.event_ropings er on er.id=e.event_roping_id
    join public.producers p on p.id=e.producer_id where e.id=new.entry_id;
  if r.membership_id is null then return new; end if;
  perform 1 from public.memberships where id=r.membership_id for update;
  -- An entered-down run follows the member's assigned number, not the entered roping's number.
  select h.id,h.classification_id into assignment from public.membership_classification_history h
    where h.membership_id=r.membership_id and h.division_id=r.division_id and h.effective_on<=r.scheduled_date
      and (h.ended_on is null or h.ended_on>=r.scheduled_date)
    order by h.effective_on desc,h.created_at desc limit 1;
  for rule in
    select w.*,f.id flag_id,f.rule_snapshot saved_snapshot from public.classification_watch_rules w
    left join public.classification_run_flags f on f.rule_id=w.id and f.run_id=new.id
    where w.producer_id=new.producer_id and
      ((w.is_active and w.classification_id=assignment.classification_id and r.classification_watch_enabled) or f.id is not null)
  loop
    snapshot := coalesce(rule.saved_snapshot,jsonb_build_object('name',rule.name,
      'threshold_seconds',rule.threshold_seconds,'inclusive',rule.inclusive,'time_basis',rule.time_basis,
      'review_count',rule.review_count,'proposed_classification_id',rule.proposed_classification_id,
      'member_classification_id',assignment.classification_id));
    measured := case when snapshot->>'time_basis'='raw' then new.raw_time_seconds
      else round(greatest(new.raw_time_seconds+new.penalty_seconds-r.handicap_time_credit_seconds,0),2) end;
    qualified := new.status='complete' and new.raw_time_seconds is not null and r.competition_status='active'
      and case when (snapshot->>'inclusive')::boolean then measured <= (snapshot->>'threshold_seconds')::numeric
        else measured < (snapshot->>'threshold_seconds')::numeric end;
    if rule.flag_id is not null then
      update public.classification_run_flags set measured_seconds=coalesce(measured,measured_seconds),
        is_active=qualified,cleared_reason=case when qualified then null else 'Run corrected or no longer qualified' end
        where id=rule.flag_id and (is_active is distinct from qualified or measured_seconds is distinct from coalesce(measured,measured_seconds));
    elsif qualified then
      insert into public.classification_run_flags(producer_id,rule_id,run_id,membership_id,division_id,
        assignment_id,event_id,event_roping_id,round_number,occurred_on,measured_seconds,rule_snapshot,recorded_by)
      values(new.producer_id,rule.id,new.id,r.membership_id,r.division_id,assignment.id,
        r.event_id,new.event_roping_id,new.round_number,r.scheduled_date,measured,snapshot,auth.uid());
    end if;
  end loop;
  return new;
end;
$$;
