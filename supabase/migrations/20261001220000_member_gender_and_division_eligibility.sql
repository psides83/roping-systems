create type public.competition_gender as enum ('female', 'male');
create type public.division_gender_policy as enum ('open', 'women_only');

alter table public.people
  add column competition_gender public.competition_gender;

alter table public.disciplines
  add column gender_policy public.division_gender_policy not null default 'open',
  add column male_youth_maximum_age integer check (
    male_youth_maximum_age is null or male_youth_maximum_age between 0 and 120
  ),
  add column male_senior_minimum_age integer check (
    male_senior_minimum_age is null or male_senior_minimum_age between 0 and 120
  ),
  add constraint discipline_gender_exceptions_valid check (
    (
      gender_policy = 'open'
      and male_youth_maximum_age is null
      and male_senior_minimum_age is null
    )
    or gender_policy = 'women_only'
  ),
  add constraint discipline_gender_exception_ages_ordered check (
    male_youth_maximum_age is null
    or male_senior_minimum_age is null
    or male_youth_maximum_age < male_senior_minimum_age
  );

alter table public.online_entry_requests
  add column competition_gender public.competition_gender;

create function public.create_organization_member_v2(
  target_organization_id uuid,
  member_first_name text,
  member_last_name text,
  member_email text,
  member_phone text,
  member_birth_date date,
  member_competition_gender public.competition_gender,
  member_classification_ids uuid[],
  new_member_number text,
  new_status public.membership_status default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_person public.people%rowtype;
  selected_person_id uuid;
  new_membership_id uuid;
  selected_classification_id uuid;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to add members to this organization';
  end if;

  if member_competition_gender is null then
    raise exception 'Competition gender is required';
  end if;

  if nullif(trim(member_email), '') is not null then
    select * into selected_person
    from public.people
    where lower(email) = lower(trim(member_email))
    limit 1;
    selected_person_id := selected_person.id;
  end if;

  if selected_person_id is null then
    insert into public.people (
      first_name,
      last_name,
      email,
      phone,
      birth_date,
      competition_gender
    ) values (
      trim(member_first_name),
      trim(member_last_name),
      nullif(lower(trim(member_email)), ''),
      nullif(trim(member_phone), ''),
      member_birth_date,
      member_competition_gender
    ) returning id into selected_person_id;
  else
    update public.people
    set birth_date = coalesce(birth_date, member_birth_date),
        competition_gender = member_competition_gender
    where id = selected_person_id;

    if selected_person.competition_gender is distinct from member_competition_gender then
      insert into public.audit_log (
        organization_id,
        actor_user_id,
        entity_type,
        entity_id,
        action,
        before_data,
        after_data
      ) values (
        target_organization_id,
        auth.uid(),
        'people',
        selected_person_id,
        'update',
        jsonb_build_object(
          'competition_gender', selected_person.competition_gender
        ),
        jsonb_build_object(
          'competition_gender', member_competition_gender
        )
      );
    end if;
  end if;

  if exists (
    select classification.discipline_id
    from unnest(coalesce(member_classification_ids, '{}'::uuid[]))
      as selected(selected_id)
    join public.classifications classification
      on classification.id = selected_id
    group by classification.discipline_id
    having count(*) > 1
  ) then
    raise exception 'Choose no more than one classification per division';
  end if;

  if exists (
    select 1
    from unnest(coalesce(member_classification_ids, '{}'::uuid[]))
      as selected(selected_id)
    left join public.classifications classification
      on classification.id = selected_id
     and classification.organization_id = target_organization_id
     and classification.is_active = true
     and classification.eligibility_type = 'skill'
    where classification.id is null
  ) then
    raise exception 'A selected classification is unavailable';
  end if;

  insert into public.organization_memberships (
    organization_id,
    person_id,
    member_number,
    status,
    joined_on
  ) values (
    target_organization_id,
    selected_person_id,
    trim(new_member_number),
    new_status,
    current_date
  ) returning id into new_membership_id;

  foreach selected_classification_id in array coalesce(
    member_classification_ids,
    '{}'::uuid[]
  ) loop
    perform public.set_member_classification(
      target_organization_id,
      new_membership_id,
      selected_classification_id,
      current_date,
      'Assigned when membership was created',
      null
    );
  end loop;

  return new_membership_id;
end;
$$;

revoke all on function public.create_organization_member_v2(
  uuid, text, text, text, text, date, public.competition_gender, uuid[], text,
  public.membership_status
) from public;
grant execute on function public.create_organization_member_v2(
  uuid, text, text, text, text, date, public.competition_gender, uuid[], text,
  public.membership_status
) to authenticated;

create function public.update_member_competition_gender(
  target_organization_id uuid,
  target_membership_id uuid,
  new_competition_gender public.competition_gender
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_person public.people%rowtype;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to edit this member';
  end if;

  select person.* into selected_person
  from public.organization_memberships membership
  join public.people person on person.id = membership.person_id
  where membership.id = target_membership_id
    and membership.organization_id = target_organization_id;

  if selected_person.id is null then
    raise exception 'That member is not available in this organization';
  end if;

  update public.people
  set competition_gender = new_competition_gender
  where id = selected_person.id;

  if selected_person.competition_gender is distinct from new_competition_gender then
    insert into public.audit_log (
      organization_id,
      actor_user_id,
      entity_type,
      entity_id,
      action,
      before_data,
      after_data
    ) values (
      target_organization_id,
      auth.uid(),
      'people',
      selected_person.id,
      'update',
      jsonb_build_object(
        'competition_gender', selected_person.competition_gender
      ),
      jsonb_build_object(
        'competition_gender', new_competition_gender
      )
    );
  end if;
end;
$$;

revoke all on function public.update_member_competition_gender(
  uuid, uuid, public.competition_gender
) from public;
grant execute on function public.update_member_competition_gender(
  uuid, uuid, public.competition_gender
) to authenticated;

create or replace function public.enforce_entry_classification_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  target_classification record;
  member_classification record;
  contestant_record public.people%rowtype;
  contestant_age integer;
  male_exception_applies boolean := false;
  eligibility_failure text;
  override_requested boolean := coalesce(new.eligibility_overridden, false);
  override_reason text := nullif(trim(new.eligibility_override_reason), '');
  transfer_override_reason text := nullif(
    trim(current_setting('app.eligibility_override_reason', true)),
    ''
  );
begin
  select * into division_record
  from public.roping_divisions
  where id = new.roping_division_id;

  select
    classification.id,
    classification.name,
    classification.discipline_id,
    classification.rank,
    classification.eligibility_type,
    classification.minimum_age,
    classification.maximum_age,
    discipline.gender_policy,
    discipline.male_youth_maximum_age,
    discipline.male_senior_minimum_age
  into target_classification
  from public.division_templates template
  join public.classifications classification
    on classification.id = template.classification_id
  join public.disciplines discipline
    on discipline.id = classification.discipline_id
  where template.id = division_record.source_template_id;

  if tg_op = 'UPDATE'
    and new.roping_division_id is distinct from old.roping_division_id
    and new.eligibility_override_reason is not distinct from old.eligibility_override_reason then
    override_requested := false;
    override_reason := null;
  end if;

  if transfer_override_reason is not null then
    override_requested := true;
    override_reason := transfer_override_reason;
  end if;

  new.is_eligible := true;
  new.eligibility_note := null;
  new.eligibility_overridden := false;
  new.eligibility_override_reason := null;
  new.eligibility_overridden_by := null;
  new.eligibility_overridden_at := null;

  select * into contestant_record
  from public.people
  where id = new.person_id;

  if new.membership_id is null and not division_record.allow_guests then
    eligibility_failure := 'An active membership is required for this class';
  elsif target_classification.gender_policy = 'women_only' then
    if contestant_record.competition_gender is null then
      eligibility_failure := 'Competition gender is required for this breakaway division';
    elsif contestant_record.competition_gender = 'male' then
      if target_classification.male_youth_maximum_age is null
        and target_classification.male_senior_minimum_age is null then
        eligibility_failure := 'This breakaway division is limited to female contestants';
      elsif contestant_record.birth_date is null then
        eligibility_failure := 'A birth date is required to verify the male breakaway exception';
      else
        contestant_age := extract(
          year from age(division_record.scheduled_date, contestant_record.birth_date)
        )::integer;
        male_exception_applies := (
          target_classification.male_youth_maximum_age is not null
          and contestant_age <= target_classification.male_youth_maximum_age
        ) or (
          target_classification.male_senior_minimum_age is not null
          and contestant_age >= target_classification.male_senior_minimum_age
        );
        if not male_exception_applies then
          eligibility_failure := 'Contestant does not meet this organization''s male breakaway age exception';
        end if;
      end if;
    end if;
  end if;

  if eligibility_failure is null then
    if target_classification.id is null
      or target_classification.eligibility_type = 'open' then
      eligibility_failure := null;
    elsif target_classification.eligibility_type = 'age' then
      if contestant_record.birth_date is null then
        eligibility_failure := format(
          'A birth date is required for the %s class',
          target_classification.name
        );
      else
        contestant_age := extract(
          year from age(division_record.scheduled_date, contestant_record.birth_date)
        )::integer;

        if target_classification.minimum_age is not null
          and contestant_age < target_classification.minimum_age then
          eligibility_failure := format(
            'Contestant does not meet the minimum age for the %s class',
            target_classification.name
          );
        elsif target_classification.maximum_age is not null
          and contestant_age > target_classification.maximum_age then
          eligibility_failure := format(
            'Contestant exceeds the maximum age for the %s class',
            target_classification.name
          );
        end if;
      end if;
    elsif new.membership_id is null then
      new.eligibility_note := 'Guest skill eligibility accepted by event staff';
    else
      select classification.name, classification.rank
        into member_classification
      from public.member_classifications assignment
      join public.classifications classification
        on classification.id = assignment.classification_id
      where assignment.membership_id = new.membership_id
        and assignment.discipline_id = target_classification.discipline_id
        and assignment.effective_on <= division_record.scheduled_date
        and (
          assignment.ended_on is null
          or assignment.ended_on >= division_record.scheduled_date
        )
        and classification.eligibility_type = 'skill'
      order by assignment.effective_on desc, assignment.created_at desc
      limit 1;

      if member_classification.rank is null then
        eligibility_failure := format(
          'Contestant needs an active skill classification for the %s division',
          target_classification.name
        );
      elsif member_classification.rank < target_classification.rank then
        eligibility_failure := format(
          'A %s contestant cannot enter the %s class',
          member_classification.name,
          target_classification.name
        );
      end if;
    end if;
  end if;

  if eligibility_failure is not null then
    if not override_requested then
      raise exception '%', eligibility_failure;
    end if;
    if not public.can_manage_organization(new.organization_id) then
      raise exception 'Manager access is required to override eligibility';
    end if;
    if length(coalesce(override_reason, '')) < 5 then
      raise exception 'Enter a brief reason for the eligibility override';
    end if;

    new.is_eligible := true;
    new.eligibility_note := eligibility_failure;
    new.eligibility_overridden := true;
    new.eligibility_override_reason := override_reason;
    new.eligibility_overridden_by := auth.uid();
    new.eligibility_overridden_at := now();
  end if;

  return new;
end;
$$;

create function public.create_guest_event_entry_v2_with_eligibility_override(
  target_roping_division_id uuid,
  guest_first_name text,
  guest_last_name text,
  guest_email text,
  guest_phone text,
  guest_birth_date date,
  guest_competition_gender public.competition_gender,
  initial_payment_status public.payment_status,
  entered_override_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  selected_person_id uuid;
begin
  select organization_id into target_organization_id
  from public.roping_divisions
  where id = target_roping_division_id;

  if target_organization_id is null
    or not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to add entries to this class';
  end if;

  if guest_competition_gender is null then
    raise exception 'Competition gender is required';
  end if;

  if nullif(trim(guest_email), '') is not null then
    select id into selected_person_id
    from public.people
    where lower(email) = lower(trim(guest_email))
    limit 1;
  end if;

  if selected_person_id is null then
    insert into public.people (
      first_name,
      last_name,
      email,
      phone,
      birth_date,
      competition_gender
    ) values (
      trim(guest_first_name),
      trim(guest_last_name),
      nullif(lower(trim(guest_email)), ''),
      nullif(trim(guest_phone), ''),
      guest_birth_date,
      guest_competition_gender
    ) returning id into selected_person_id;
  else
    update public.people
    set birth_date = coalesce(birth_date, guest_birth_date),
        competition_gender = guest_competition_gender
    where id = selected_person_id;
  end if;

  return public.create_event_entry_with_eligibility_override(
    target_roping_division_id,
    selected_person_id,
    'office'::public.entry_source,
    initial_payment_status,
    entered_override_reason
  );
end;
$$;

revoke all on function public.create_guest_event_entry_v2_with_eligibility_override(
  uuid, text, text, text, text, date, public.competition_gender,
  public.payment_status, text
) from public;
grant execute on function public.create_guest_event_entry_v2_with_eligibility_override(
  uuid, text, text, text, text, date, public.competition_gender,
  public.payment_status, text
) to authenticated;

create function public.submit_online_entry_request_v3(
  target_organization_slug text,
  target_roping_slug text,
  contestant_first_name text,
  contestant_last_name text,
  contestant_email text,
  contestant_phone text,
  contestant_birth_date date,
  contestant_competition_gender public.competition_gender,
  contestant_member_number text,
  contestant_note text,
  requested_divisions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
begin
  if contestant_competition_gender is null then
    raise exception 'Competition gender is required';
  end if;

  request_id := public.submit_online_entry_request_v2(
    target_organization_slug,
    target_roping_slug,
    contestant_first_name,
    contestant_last_name,
    contestant_email,
    contestant_phone,
    contestant_birth_date,
    contestant_member_number,
    contestant_note,
    requested_divisions
  );

  update public.online_entry_requests
  set competition_gender = contestant_competition_gender
  where id = request_id;

  return request_id;
end;
$$;

revoke all on function public.submit_online_entry_request_v3(
  text, text, text, text, text, text, date, public.competition_gender,
  text, text, jsonb
) from public;
grant execute on function public.submit_online_entry_request_v3(
  text, text, text, text, text, text, date, public.competition_gender,
  text, text, jsonb
) to anon, authenticated;

create or replace function public.review_online_entry_request_with_eligibility_override(
  target_request_id uuid,
  review_decision public.entry_request_status,
  entered_review_note text,
  override_eligibility boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_record public.online_entry_requests%rowtype;
  selected_person_id uuid;
  item_record public.online_entry_request_items%rowtype;
  option_record public.online_entry_request_options%rowtype;
  new_entry_id uuid;
  entries_created integer := 0;
begin
  select * into request_record
  from public.online_entry_requests
  where id = target_request_id
  for update;

  if request_record.id is null
    or not public.can_manage_organization(request_record.organization_id) then
    raise exception 'You do not have permission to review this request';
  end if;
  if request_record.status <> 'pending' then
    raise exception 'This request has already been reviewed';
  end if;
  if review_decision not in ('accepted', 'declined') then
    raise exception 'Choose accepted or declined';
  end if;
  if review_decision = 'accepted'
    and override_eligibility
    and length(trim(coalesce(entered_review_note, ''))) < 5 then
    raise exception 'Enter an office note explaining the eligibility override';
  end if;

  if review_decision = 'accepted' then
    selected_person_id := request_record.person_id;
    if selected_person_id is null then
      select id into selected_person_id
      from public.people
      where lower(email) = lower(request_record.email)
      limit 1;
    end if;
    if selected_person_id is null then
      insert into public.people (
        first_name,
        last_name,
        email,
        phone,
        birth_date,
        competition_gender
      ) values (
        request_record.first_name,
        request_record.last_name,
        request_record.email,
        request_record.phone,
        request_record.birth_date,
        request_record.competition_gender
      ) returning id into selected_person_id;
    else
      update public.people
      set birth_date = coalesce(birth_date, request_record.birth_date),
          competition_gender = coalesce(
            request_record.competition_gender,
            competition_gender
          )
      where id = selected_person_id;
    end if;

    for item_record in
      select * from public.online_entry_request_items
      where request_id = request_record.id
      order by created_at
    loop
      for entry_number_index in 1..item_record.quantity loop
        new_entry_id := public.create_event_entry_with_eligibility_override(
          item_record.roping_division_id,
          selected_person_id,
          'online'::public.entry_source,
          'unpaid'::public.payment_status,
          case
            when override_eligibility then entered_review_note
            else null
          end
        );
        for option_record in
          select * from public.online_entry_request_options
          where request_item_id = item_record.id
        loop
          perform public.add_entry_option(
            new_entry_id,
            option_record.roping_fee_id
          );
        end loop;
        entries_created := entries_created + 1;
      end loop;
    end loop;

    update public.online_entry_requests
    set person_id = selected_person_id
    where id = request_record.id;
  end if;

  update public.online_entry_requests
  set status = review_decision,
      review_note = nullif(trim(entered_review_note), ''),
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = request_record.id;

  return entries_created;
end;
$$;
