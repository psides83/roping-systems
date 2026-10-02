alter table public.member_classifications
  add column ended_reason text,
  add column ended_by uuid references auth.users(id) on delete set null;

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
  target_discipline_id uuid;
  new_assignment_id uuid;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to manage classifications for this organization';
  end if;

  if not exists (
    select 1 from public.organization_memberships
    where id = target_membership_id
      and organization_id = target_organization_id
  ) then
    raise exception 'Member not found in this organization';
  end if;

  select discipline_id into target_discipline_id
  from public.classifications
  where id = target_classification_id
    and organization_id = target_organization_id
    and is_active = true;

  if target_discipline_id is null then
    raise exception 'Classification not found or inactive';
  end if;

  update public.member_classifications
  set ended_on = greatest(effective_on, new_effective_on),
      ended_reason = nullif(trim(change_reason), ''),
      ended_by = auth.uid()
  where membership_id = target_membership_id
    and discipline_id = target_discipline_id
    and ended_on is null;

  insert into public.member_classifications (
    organization_id,
    membership_id,
    discipline_id,
    classification_id,
    effective_on,
    reason,
    assigned_by
  ) values (
    target_organization_id,
    target_membership_id,
    target_discipline_id,
    target_classification_id,
    new_effective_on,
    nullif(trim(change_reason), ''),
    auth.uid()
  ) returning id into new_assignment_id;

  if source_review_id is not null then
    update public.classification_reviews
    set status = 'approved',
        proposed_classification_id = target_classification_id,
        resolved_by = auth.uid(),
        resolved_at = now()
    where id = source_review_id
      and organization_id = target_organization_id
      and membership_id = target_membership_id
      and status = 'open';
  end if;

  return new_assignment_id;
end;
$$;

create or replace function public.update_organization_member(
  target_organization_id uuid,
  target_membership_id uuid,
  member_first_name text,
  member_last_name text,
  member_email text,
  member_phone text,
  member_birth_date date,
  member_competition_gender public.competition_gender,
  new_member_number text,
  new_status public.membership_status,
  new_joined_on date,
  new_expires_on date,
  new_notes text,
  classification_changes jsonb,
  classification_effective_on date,
  classification_change_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  membership_record public.organization_memberships%rowtype;
  person_record public.people%rowtype;
  change_record jsonb;
  target_discipline_id uuid;
  target_classification_id uuid;
  current_assignment public.member_classifications%rowtype;
  selected_classification public.classifications%rowtype;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to edit this member';
  end if;

  select * into membership_record
  from public.organization_memberships
  where id = target_membership_id
    and organization_id = target_organization_id;

  if membership_record.id is null then
    raise exception 'That member is not available in this organization';
  end if;

  select * into person_record
  from public.people
  where id = membership_record.person_id;

  if nullif(trim(member_first_name), '') is null
    or nullif(trim(member_last_name), '') is null then
    raise exception 'First and last name are required';
  end if;
  if nullif(trim(new_member_number), '') is null then
    raise exception 'Member number is required';
  end if;
  if new_expires_on is not null
    and new_joined_on is not null
    and new_expires_on < new_joined_on then
    raise exception 'Expiration date cannot be before the joined date';
  end if;
  if nullif(trim(member_email), '') is not null and exists (
    select 1
    from public.people
    where lower(email) = lower(trim(member_email))
      and id <> person_record.id
  ) then
    raise exception 'That email address is already used by another person';
  end if;
  if classification_changes is null
    or jsonb_typeof(classification_changes) <> 'array' then
    raise exception 'Classification selections are invalid';
  end if;

  update public.people
  set first_name = trim(member_first_name),
      last_name = trim(member_last_name),
      email = nullif(lower(trim(member_email)), ''),
      phone = nullif(trim(member_phone), ''),
      birth_date = member_birth_date,
      competition_gender = member_competition_gender
  where id = person_record.id;

  if to_jsonb(person_record) is distinct from (
    select to_jsonb(person) from public.people person where person.id = person_record.id
  ) then
    insert into public.audit_log (
      organization_id,
      actor_user_id,
      entity_type,
      entity_id,
      action,
      before_data,
      after_data
    )
    select
      target_organization_id,
      auth.uid(),
      'people',
      person_record.id,
      'update',
      to_jsonb(person_record),
      to_jsonb(person)
    from public.people person
    where person.id = person_record.id;
  end if;

  update public.organization_memberships
  set member_number = trim(new_member_number),
      status = new_status,
      joined_on = new_joined_on,
      expires_on = new_expires_on,
      notes = nullif(trim(new_notes), '')
  where id = target_membership_id
    and organization_id = target_organization_id;

  for change_record in select * from jsonb_array_elements(classification_changes)
  loop
    target_discipline_id := (change_record ->> 'disciplineId')::uuid;
    target_classification_id := nullif(
      change_record ->> 'classificationId',
      ''
    )::uuid;

    if not exists (
      select 1 from public.disciplines
      where id = target_discipline_id
        and organization_id = target_organization_id
    ) then
      raise exception 'A selected division is unavailable';
    end if;

    current_assignment := null;
    select * into current_assignment
    from public.member_classifications
    where organization_id = target_organization_id
      and membership_id = target_membership_id
      and discipline_id = target_discipline_id
      and ended_on is null;

    if current_assignment.classification_id
      is not distinct from target_classification_id then
      continue;
    end if;

    if nullif(trim(classification_change_reason), '') is null then
      raise exception 'Enter a reason for classification changes';
    end if;
    if classification_effective_on is null then
      raise exception 'Choose an effective date for classification changes';
    end if;

    if current_assignment.id is not null then
      update public.member_classifications
      set ended_on = greatest(effective_on, classification_effective_on),
          ended_reason = trim(classification_change_reason),
          ended_by = auth.uid()
      where id = current_assignment.id;
    end if;

    if target_classification_id is not null then
      selected_classification := null;
      select * into selected_classification
      from public.classifications
      where id = target_classification_id
        and organization_id = target_organization_id
        and discipline_id = target_discipline_id
        and eligibility_type = 'skill'
        and is_active = true;

      if selected_classification.id is null then
        raise exception 'A selected classification is unavailable';
      end if;

      insert into public.member_classifications (
        organization_id,
        membership_id,
        discipline_id,
        classification_id,
        effective_on,
        reason,
        assigned_by
      ) values (
        target_organization_id,
        target_membership_id,
        target_discipline_id,
        target_classification_id,
        classification_effective_on,
        trim(classification_change_reason),
        auth.uid()
      );
    end if;
  end loop;
end;
$$;

revoke all on function public.update_organization_member(
  uuid, uuid, text, text, text, text, date, public.competition_gender, text,
  public.membership_status, date, date, text, jsonb, date, text
) from public;
grant execute on function public.update_organization_member(
  uuid, uuid, text, text, text, text, date, public.competition_gender, text,
  public.membership_status, date, date, text, jsonb, date, text
) to authenticated;
