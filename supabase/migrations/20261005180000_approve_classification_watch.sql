alter table public.membership_classification_reviews
  add column approved_assignment_id uuid,
  add column decision_staff_label text,
  add constraint classification_review_assignment_fk foreign key(approved_assignment_id,producer_id)
    references public.membership_classification_history(id,producer_id);
alter table public.classification_run_flags add column review_id uuid,
  add constraint classification_run_flags_review_fk foreign key(review_id,producer_id)
    references public.membership_classification_reviews(id,producer_id);
create index classification_run_flags_review_idx on public.classification_run_flags(review_id) where review_id is not null;

create function public.approve_classification_watch(
  target_producer_id uuid, target_membership_id uuid, target_division_id uuid,
  expected_assignment_id uuid, target_classification_id uuid, new_effective_on date,
  change_reason text, source_flag_ids uuid[], target_review_id uuid
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  current_assignment public.membership_classification_history%rowtype;
  previous_review public.membership_classification_reviews%rowtype;
  assignment uuid;
  evidence_count integer;
  latest_run date;
begin
  if auth.uid() is null or not public.can_manage_organization(target_producer_id) then
    raise exception 'You do not have permission to approve classification changes'; end if;
  perform 1 from public.memberships where id=target_membership_id and producer_id=target_producer_id for update;
  if not found then raise exception 'Member not found for this producer'; end if;
  if target_review_id is null or new_effective_on is null
    or length(trim(coalesce(change_reason,''))) not between 5 and 2000
    or coalesce(cardinality(source_flag_ids),0) not between 1 and 1000
    or (select count(distinct id) from unnest(source_flag_ids) id) <> cardinality(source_flag_ids) then
    raise exception 'Select run evidence, an effective date, and a clearly explained reason'; end if;

  -- A retried submission returns its original result rather than creating another move.
  select * into previous_review from public.membership_classification_reviews where id=target_review_id;
  if found then
    if previous_review.producer_id=target_producer_id and previous_review.membership_id=target_membership_id
      and previous_review.division_id=target_division_id and previous_review.proposed_classification_id=target_classification_id
      and previous_review.review_on=new_effective_on and previous_review.reason=trim(change_reason)
      and previous_review.status='approved' and previous_review.approved_assignment_id is not null
      and (select count(*) from public.classification_run_flags where review_id=target_review_id)=cardinality(source_flag_ids)
      and (select count(*) from public.classification_run_flags where review_id=target_review_id and id=any(source_flag_ids))=cardinality(source_flag_ids)
    then return previous_review.approved_assignment_id; end if;
    raise exception 'This approval reference has already been used';
  end if;

  select * into current_assignment from public.membership_classification_history
    where producer_id=target_producer_id and membership_id=target_membership_id
      and division_id=target_division_id and ended_on is null for update;
  if not found or current_assignment.id is distinct from expected_assignment_id then
    raise exception 'The member classification has changed. Refresh the watch list before approving a move.'; end if;
  if target_classification_id=current_assignment.classification_id then
    raise exception 'Choose a different classification, or mark the evidence reviewed without a move'; end if;
  perform 1 from public.classifications where id=target_classification_id and producer_id=target_producer_id
    and division_id=target_division_id and is_active for key share;
  if not found then raise exception 'Choose an active classification in the same division'; end if;

  perform 1 from public.classification_run_flags where id=any(source_flag_ids) for update;
  select count(*),max(occurred_on) into evidence_count,latest_run from public.classification_run_flags
    where id=any(source_flag_ids) and producer_id=target_producer_id and membership_id=target_membership_id
      and division_id=target_division_id and assignment_id=expected_assignment_id and is_active and reviewed_at is null;
  if evidence_count<>cardinality(source_flag_ids) then
    raise exception 'Some run evidence has been corrected or reviewed. Refresh the watch list before approving.'; end if;
  if new_effective_on<greatest(current_assignment.effective_on,latest_run) then
    raise exception 'The effective date cannot precede the current assignment or the reviewed runs'; end if;

  assignment := public.set_member_classification(target_producer_id,target_membership_id,
    target_classification_id,new_effective_on,trim(change_reason),null);
  insert into public.membership_classification_reviews(id,producer_id,membership_id,division_id,
    current_classification_id,proposed_classification_id,status,reason,notes,review_on,created_by,
    resolved_by,resolved_at,approved_assignment_id,decision_staff_label)
  values(target_review_id,target_producer_id,target_membership_id,target_division_id,
    current_assignment.classification_id,target_classification_id,'approved',trim(change_reason),
    'Approved from classification watch: ' || evidence_count || ' qualifying runs',new_effective_on,auth.uid(),
    auth.uid(),now(),assignment,coalesce(auth.jwt()->>'email','Staff'));
  update public.classification_run_flags set review_id=target_review_id,reviewed_at=now(),
    reviewed_by=auth.uid(),review_reason=trim(change_reason) where id=any(source_flag_ids);
  return assignment;
end;
$$;
revoke all on function public.approve_classification_watch(uuid,uuid,uuid,uuid,uuid,date,text,uuid[],uuid) from public,anon;
grant execute on function public.approve_classification_watch(uuid,uuid,uuid,uuid,uuid,date,text,uuid[],uuid) to authenticated;
