alter table public.entries
  add column eligibility_overridden boolean not null default false,
  add column eligibility_override_reason text,
  add column eligibility_overridden_by uuid references auth.users(id) on delete set null,
  add column eligibility_overridden_at timestamptz,
  add constraint entry_eligibility_override_complete check (
    (
      eligibility_overridden = true
      and length(trim(eligibility_override_reason)) >= 5
      and eligibility_overridden_at is not null
    )
    or (
      eligibility_overridden = false
      and eligibility_override_reason is null
      and eligibility_overridden_by is null
      and eligibility_overridden_at is null
    )
  );

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
  contestant_birth_date date;
  contestant_age integer;
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
    classification.maximum_age
  into target_classification
  from public.division_templates template
  join public.classifications classification
    on classification.id = template.classification_id
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

  if new.membership_id is null and not division_record.allow_guests then
    eligibility_failure := 'An active membership is required for this class';
  elsif target_classification.id is null
    or target_classification.eligibility_type = 'open' then
    eligibility_failure := null;
  elsif target_classification.eligibility_type = 'age' then
    select birth_date into contestant_birth_date
    from public.people
    where id = new.person_id;

    if contestant_birth_date is null then
      eligibility_failure := format(
        'A birth date is required for the %s class',
        target_classification.name
      );
    else
      contestant_age := extract(
        year from age(division_record.scheduled_date, contestant_birth_date)
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

drop trigger entries_enforce_classification_on_update on public.entries;
create trigger entries_enforce_classification_on_update
before update of
  roping_division_id,
  membership_id,
  person_id,
  eligibility_overridden,
  eligibility_override_reason
on public.entries
for each row execute function public.enforce_entry_classification_eligibility();

create function public.create_event_entry_with_eligibility_override(
  target_roping_division_id uuid,
  target_person_id uuid,
  entry_origin public.entry_source,
  initial_payment_status public.payment_status,
  entered_override_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  selected_membership_id uuid;
  selected_classification_id uuid;
  selected_adjustment numeric(8, 3) := 0;
  existing_entry_count integer;
  new_entry_id uuid;
  fee_record public.roping_fees%rowtype;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to add entries to this class';
  end if;
  if entered_override_reason is not null
    and length(trim(entered_override_reason)) < 5 then
    raise exception 'Enter a brief reason for the eligibility override';
  end if;

  select id into selected_membership_id
  from public.organization_memberships
  where organization_id = division_record.organization_id
    and person_id = target_person_id
    and status = 'active'
  limit 1;

  if selected_membership_id is not null and division_record.incentive_enabled then
    select rule.classification_id, rule.adjustment_seconds
      into selected_classification_id, selected_adjustment
    from public.roping_incentive_rules rule
    join public.member_classifications member_classification
      on member_classification.classification_id = rule.classification_id
     and member_classification.membership_id = selected_membership_id
     and member_classification.ended_on is null
     and member_classification.effective_on <= division_record.scheduled_date
    where rule.roping_division_id = division_record.id
    order by rule.adjustment_seconds desc
    limit 1;
  end if;

  select count(*) into existing_entry_count
  from public.entries
  where roping_division_id = target_roping_division_id
    and person_id = target_person_id;

  if division_record.maximum_entries_per_person is not null
    and existing_entry_count >= division_record.maximum_entries_per_person then
    raise exception 'This contestant has reached the entry limit for this class';
  end if;

  insert into public.entries (
    organization_id,
    roping_id,
    roping_division_id,
    person_id,
    membership_id,
    entry_number,
    source,
    payment_status,
    incentive_classification_id,
    incentive_adjustment_seconds,
    eligibility_overridden,
    eligibility_override_reason
  ) values (
    division_record.organization_id,
    division_record.roping_id,
    division_record.id,
    target_person_id,
    selected_membership_id,
    existing_entry_count + 1,
    entry_origin,
    initial_payment_status,
    selected_classification_id,
    coalesce(selected_adjustment, 0),
    entered_override_reason is not null,
    nullif(trim(entered_override_reason), '')
  ) returning id into new_entry_id;

  for fee_record in
    select * from public.roping_fees
    where roping_id = division_record.roping_id
      and (
        roping_division_id = division_record.id
        or roping_division_id is null
      )
      and is_required = true
    order by sort_order, created_at
  loop
    if fee_record.scope = 'entry' then
      insert into public.entry_charges (
        organization_id,
        roping_id,
        person_id,
        entry_id,
        roping_fee_id,
        title,
        amount_cents
      ) values (
        division_record.organization_id,
        division_record.roping_id,
        target_person_id,
        new_entry_id,
        fee_record.id,
        fee_record.title,
        fee_record.amount_cents
      );
    elsif not exists (
      select 1 from public.entry_charges charge
      where charge.roping_id = division_record.roping_id
        and charge.person_id = target_person_id
        and charge.roping_fee_id = fee_record.id
    ) then
      insert into public.entry_charges (
        organization_id,
        roping_id,
        person_id,
        entry_id,
        roping_fee_id,
        title,
        amount_cents
      ) values (
        division_record.organization_id,
        division_record.roping_id,
        target_person_id,
        null,
        fee_record.id,
        fee_record.title,
        fee_record.amount_cents
      );
    end if;
  end loop;

  for run_number_index in 1..division_record.number_of_runs loop
    insert into public.runs (
      organization_id,
      roping_division_id,
      entry_id,
      run_number
    ) values (
      division_record.organization_id,
      division_record.id,
      new_entry_id,
      run_number_index
    );
  end loop;

  return new_entry_id;
end;
$$;

create or replace function public.create_event_entry(
  target_roping_division_id uuid,
  target_person_id uuid,
  entry_origin public.entry_source default 'office',
  initial_payment_status public.payment_status default 'unpaid'
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.create_event_entry_with_eligibility_override(
    target_roping_division_id,
    target_person_id,
    entry_origin,
    initial_payment_status,
    null
  );
$$;

revoke all on function public.create_event_entry_with_eligibility_override(
  uuid, uuid, public.entry_source, public.payment_status, text
) from public;
grant execute on function public.create_event_entry_with_eligibility_override(
  uuid, uuid, public.entry_source, public.payment_status, text
) to authenticated;

create function public.create_guest_event_entry_with_eligibility_override(
  target_roping_division_id uuid,
  guest_first_name text,
  guest_last_name text,
  guest_email text,
  guest_phone text,
  guest_birth_date date,
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

  if nullif(trim(guest_email), '') is not null then
    select id into selected_person_id
    from public.people
    where lower(email) = lower(trim(guest_email))
    limit 1;
  end if;

  if selected_person_id is null then
    insert into public.people (first_name, last_name, email, phone, birth_date)
    values (
      trim(guest_first_name),
      trim(guest_last_name),
      nullif(lower(trim(guest_email)), ''),
      nullif(trim(guest_phone), ''),
      guest_birth_date
    ) returning id into selected_person_id;
  elsif guest_birth_date is not null then
    update public.people
    set birth_date = coalesce(birth_date, guest_birth_date)
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

revoke all on function public.create_guest_event_entry_with_eligibility_override(
  uuid, text, text, text, text, date, public.payment_status, text
) from public;
grant execute on function public.create_guest_event_entry_with_eligibility_override(
  uuid, text, text, text, text, date, public.payment_status, text
) to authenticated;

create function public.review_online_entry_request_with_eligibility_override(
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
      insert into public.people (first_name, last_name, email, phone, birth_date)
      values (
        request_record.first_name,
        request_record.last_name,
        request_record.email,
        request_record.phone,
        request_record.birth_date
      ) returning id into selected_person_id;
    elsif request_record.birth_date is not null then
      update public.people
      set birth_date = coalesce(birth_date, request_record.birth_date)
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

create or replace function public.review_online_entry_request(
  target_request_id uuid,
  review_decision public.entry_request_status,
  entered_review_note text default null
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.review_online_entry_request_with_eligibility_override(
    target_request_id,
    review_decision,
    entered_review_note,
    false
  );
$$;

revoke all on function public.review_online_entry_request_with_eligibility_override(
  uuid, public.entry_request_status, text, boolean
) from public;
grant execute on function public.review_online_entry_request_with_eligibility_override(
  uuid, public.entry_request_status, text, boolean
) to authenticated;

create function public.transfer_event_entry_with_eligibility_override(
  target_entry_id uuid,
  target_division_id uuid,
  transfer_reason text,
  entered_override_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  transfer_id uuid;
begin
  if nullif(trim(entered_override_reason), '') is not null
    and length(trim(entered_override_reason)) < 5 then
    raise exception 'Enter a brief reason for the eligibility override';
  end if;

  perform set_config(
    'app.eligibility_override_reason',
    coalesce(nullif(trim(entered_override_reason), ''), ''),
    true
  );

  transfer_id := public.transfer_event_entry(
    target_entry_id,
    target_division_id,
    transfer_reason
  );

  perform set_config('app.eligibility_override_reason', '', true);
  return transfer_id;
end;
$$;

revoke all on function public.transfer_event_entry_with_eligibility_override(
  uuid, uuid, text, text
) from public;
grant execute on function public.transfer_event_entry_with_eligibility_override(
  uuid, uuid, text, text
) to authenticated;
