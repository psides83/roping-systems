create function public.member_move_back_details(target_membership_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p uuid; h public.membership_classification_history%rowtype; state jsonb;
  progress jsonb:='[]'; participation jsonb; exceptions jsonb; blocked jsonb;
begin
  select producer_id into p from public.memberships where id=target_membership_id;
  if p is null or auth.uid() is null or not public.has_organization_access(p) then
    raise exception 'You do not have permission to read this member’s classification progress';
  end if;
  for h in select * from public.membership_classification_history where membership_id=target_membership_id and ended_on is null loop
    state:=private.classification_move_back_state(h.id);
    -- Match the eligibility counter: one row per roping, including same-class reassignments.
    with recursive segment as (
      select id,previous_assignment_id,classification_id,array[id] visited
        from public.membership_classification_history where id=h.id
      union all
      select previous.id,previous.previous_assignment_id,previous.classification_id,segment.visited||previous.id
        from public.membership_classification_history previous join segment on previous.id=segment.previous_assignment_id
        where previous.classification_id=h.classification_id and not previous.id=any(segment.visited)
    ), counted as (
      select er.id roping_id,er.event_id,er.name,er.scheduled_date,ev.title event_title,
        count(*) filter(where run.status='complete') qualified_runs,
        count(*) filter(where run.status='no_time') no_time_runs,
        count(*) filter(where run.status='disqualified') disqualified_runs
      from public.competition_runs run join segment on segment.id=run.competed_assignment_id
      join public.roping_entries entry on entry.id=run.entry_id
      join public.event_ropings er on er.id=entry.event_roping_id
      join public.events ev on ev.id=er.event_id
      where run.producer_id=p and er.division_id=h.division_id and entry.competition_status='active'
        and (run.status in ('complete','no_time') or (run.status='disqualified' and run.raw_time_seconds is not null))
      group by er.id,ev.title
    )
    select coalesce(jsonb_agg(jsonb_build_object('ropingId',roping_id,'eventId',event_id,'name',name,
      'eventTitle',event_title,'date',scheduled_date,'qualifiedRuns',qualified_runs,
      'noTimeRuns',no_time_runs,'disqualifiedRuns',disqualified_runs) order by scheduled_date desc,roping_id),'[]') into participation from counted;
    select coalesce(jsonb_agg(target.id),'[]') into blocked from public.classifications target
      join public.classifications current_class on current_class.id=h.classification_id
      where target.producer_id=p and target.division_id=h.division_id and target.id<>h.classification_id
        and (target.id=(state->>'previousClassificationId')::uuid
          or (target.eligibility_type='skill' and current_class.eligibility_type='skill' and target.rank>current_class.rank and current_class.rank>0));
    progress:=progress||jsonb_build_array(state||jsonb_build_object('participation',participation,'moveBackTargetIds',blocked));
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id',exception.id,'divisionName',division.name,
    'classificationName',classification.name,'effectiveOn',assignment.effective_on,
    'reason',exception.reason,'staffLabel',exception.staff_label,'approvedAt',exception.created_at,
    'requiredRopings',exception.required_ropings,'completedRopings',exception.completed_ropings)
    order by exception.created_at desc,exception.id),'[]') into exceptions
    from public.classification_move_back_exceptions exception
    join public.membership_classification_history assignment on assignment.id=exception.assignment_id
    join public.classifications classification on classification.id=assignment.classification_id
    join public.divisions division on division.id=exception.division_id
    where exception.membership_id=target_membership_id and exception.producer_id=p;
  return jsonb_build_object('progress',progress,'exceptions',exceptions);
end;
$$;
revoke all on function public.member_move_back_details(uuid) from public,anon;
grant execute on function public.member_move_back_details(uuid) to authenticated;
