create or replace function public.set_member_classification(
  target_organization_id uuid,
  target_membership_id uuid,
  target_classification_id uuid,
  new_effective_on date,
  change_reason text default null,
  source_review_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_division_id uuid;
  new_assignment_id uuid;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to manage classifications for this producer';
  end if;

  if not exists (
    select 1
    from public.memberships
    where id = target_membership_id
      and producer_id = target_organization_id
  ) then
    raise exception 'Member not found for this producer';
  end if;

  select discipline_id into target_division_id
  from public.classifications
  where id = target_classification_id
    and organization_id = target_organization_id
    and is_active = true;

  if target_division_id is null then
    raise exception 'Classification not found or inactive';
  end if;

  update public.membership_classification_history
  set ended_on = greatest(effective_on, new_effective_on),
      ended_reason = nullif(trim(change_reason), ''),
      ended_by = auth.uid()
  where membership_id = target_membership_id
    and division_id = target_division_id
    and ended_on is null;

  insert into public.membership_classification_history (
    producer_id,
    membership_id,
    division_id,
    classification_id,
    effective_on,
    reason,
    assigned_by
  ) values (
    target_organization_id,
    target_membership_id,
    target_division_id,
    target_classification_id,
    new_effective_on,
    nullif(trim(change_reason), ''),
    auth.uid()
  ) returning id into new_assignment_id;

  if source_review_id is not null then
    update public.membership_classification_reviews
    set status = 'approved',
        proposed_classification_id = target_classification_id,
        resolved_by = auth.uid(),
        resolved_at = now()
    where id = source_review_id
      and producer_id = target_organization_id
      and membership_id = target_membership_id
      and status = 'open';
  end if;

  return new_assignment_id;
end;
$$;
