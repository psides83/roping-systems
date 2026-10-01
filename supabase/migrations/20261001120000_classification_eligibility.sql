create type public.classification_eligibility_type as enum ('skill', 'open', 'age');

alter table public.classifications
  add column eligibility_type public.classification_eligibility_type not null default 'skill',
  add column minimum_age integer check (minimum_age is null or minimum_age between 0 and 120),
  add column maximum_age integer check (maximum_age is null or maximum_age between 0 and 120);

update public.classifications
set eligibility_type = 'open'
where lower(trim(name)) = 'open';

update public.classifications
set eligibility_type = 'age',
    minimum_age = regexp_replace(name, '^\s*([0-9]+).*$' , '\1')::integer
where name ~* '^\s*[0-9]+\s*(\+|(&|and)?\s*over)\s*$';

update public.classifications
set eligibility_type = 'age',
    maximum_age = regexp_replace(name, '^\s*([0-9]+).*$' , '\1')::integer
where name ~* '^\s*[0-9]+\s*(&|and)?\s*under\s*$';

alter table public.classifications
  add constraint classification_age_range_valid check (
    (eligibility_type = 'age' and (minimum_age is not null or maximum_age is not null))
    or (eligibility_type <> 'age' and minimum_age is null and maximum_age is null)
  ),
  add constraint classification_age_bounds_ordered check (
    minimum_age is null or maximum_age is null or minimum_age <= maximum_age
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

  new.is_eligible := true;
  new.eligibility_note := null;

  if target_classification.id is null
    or target_classification.eligibility_type = 'open' then
    return new;
  end if;

  if target_classification.eligibility_type = 'age' then
    select birth_date into contestant_birth_date
    from public.people
    where id = new.person_id;

    if contestant_birth_date is null then
      raise exception 'A birth date is required to enter the % class', target_classification.name;
    end if;

    contestant_age := extract(
      year from age(division_record.scheduled_date, contestant_birth_date)
    )::integer;

    if target_classification.minimum_age is not null
      and contestant_age < target_classification.minimum_age then
      raise exception 'Contestant does not meet the minimum age for the % class', target_classification.name;
    end if;
    if target_classification.maximum_age is not null
      and contestant_age > target_classification.maximum_age then
      raise exception 'Contestant exceeds the maximum age for the % class', target_classification.name;
    end if;
    return new;
  end if;

  if new.membership_id is null then
    new.eligibility_note := 'Guest skill eligibility accepted by event staff';
    return new;
  end if;

  select classification.name, classification.rank
    into member_classification
  from public.member_classifications assignment
  join public.classifications classification
    on classification.id = assignment.classification_id
  where assignment.membership_id = new.membership_id
    and assignment.discipline_id = target_classification.discipline_id
    and assignment.effective_on <= division_record.scheduled_date
    and (assignment.ended_on is null or assignment.ended_on >= division_record.scheduled_date)
    and classification.eligibility_type = 'skill'
  order by assignment.effective_on desc, assignment.created_at desc
  limit 1;

  if member_classification.rank is null then
    raise exception 'Contestant needs an active skill classification for the % division', target_classification.name;
  end if;

  if member_classification.rank < target_classification.rank then
    raise exception 'A % contestant cannot enter the % class', member_classification.name, target_classification.name;
  end if;

  return new;
end;
$$;

create trigger entries_enforce_classification_on_insert
before insert on public.entries
for each row execute function public.enforce_entry_classification_eligibility();

create trigger entries_enforce_classification_on_update
before update of roping_division_id, membership_id, person_id on public.entries
for each row execute function public.enforce_entry_classification_eligibility();

alter table public.online_entry_requests
  add column birth_date date;

create or replace function public.submit_online_entry_request_v2(
  target_organization_slug text,
  target_roping_slug text,
  contestant_first_name text,
  contestant_last_name text,
  contestant_email text,
  contestant_phone text,
  contestant_birth_date date,
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
  if contestant_birth_date is null
    and jsonb_typeof(requested_divisions) = 'array'
    and exists (
      select 1
      from jsonb_array_elements(requested_divisions) requested
      join public.roping_divisions division
        on division.id = (requested ->> 'divisionId')::uuid
      join public.division_templates template
        on template.id = division.source_template_id
      join public.classifications classification
        on classification.id = template.classification_id
      where classification.eligibility_type = 'age'
    ) then
    raise exception 'Birth date is required for age-limited classes';
  end if;

  request_id := public.submit_online_entry_request(
    target_organization_slug,
    target_roping_slug,
    contestant_first_name,
    contestant_last_name,
    contestant_email,
    contestant_phone,
    contestant_member_number,
    contestant_note,
    requested_divisions
  );

  update public.online_entry_requests
  set birth_date = contestant_birth_date
  where id = request_id;

  return request_id;
end;
$$;

grant execute on function public.submit_online_entry_request_v2(
  text, text, text, text, text, text, date, text, text, jsonb
) to anon, authenticated;

create or replace function public.review_online_entry_request(
  target_request_id uuid,
  review_decision public.entry_request_status,
  entered_review_note text default null
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
  entry_index integer;
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
      for entry_index in 1..item_record.quantity
      loop
        new_entry_id := public.create_event_entry(
          item_record.roping_division_id,
          selected_person_id,
          'online'::public.entry_source,
          'unpaid'::public.payment_status
        );
        for option_record in
          select * from public.online_entry_request_options
          where request_item_id = item_record.id
        loop
          perform public.add_entry_option(new_entry_id, option_record.roping_fee_id);
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

create or replace function public.create_guest_event_entry(
  target_roping_division_id uuid,
  guest_first_name text,
  guest_last_name text,
  guest_email text,
  guest_phone text,
  guest_birth_date date,
  initial_payment_status public.payment_status default 'unpaid'
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

  return public.create_event_entry(
    target_roping_division_id,
    selected_person_id,
    'office'::public.entry_source,
    initial_payment_status
  );
end;
$$;

grant execute on function public.create_guest_event_entry(
  uuid, text, text, text, text, date, public.payment_status
) to authenticated;

create or replace function public.create_organization_member(
  target_organization_id uuid,
  member_first_name text,
  member_last_name text,
  member_email text,
  member_phone text,
  member_birth_date date,
  new_member_number text,
  new_status public.membership_status default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_person_id uuid;
  new_membership_id uuid;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to add members to this organization';
  end if;

  if nullif(trim(member_email), '') is not null then
    select id into selected_person_id
    from public.people
    where lower(email) = lower(trim(member_email))
    limit 1;
  end if;

  if selected_person_id is null then
    insert into public.people (first_name, last_name, email, phone, birth_date)
    values (
      trim(member_first_name),
      trim(member_last_name),
      nullif(lower(trim(member_email)), ''),
      nullif(trim(member_phone), ''),
      member_birth_date
    ) returning id into selected_person_id;
  elsif member_birth_date is not null then
    update public.people
    set birth_date = coalesce(birth_date, member_birth_date)
    where id = selected_person_id;
  end if;

  insert into public.organization_memberships (
    organization_id, person_id, member_number, status, joined_on
  ) values (
    target_organization_id,
    selected_person_id,
    trim(new_member_number),
    new_status,
    current_date
  ) returning id into new_membership_id;

  return new_membership_id;
end;
$$;

grant execute on function public.create_organization_member(
  uuid, text, text, text, text, date, text, public.membership_status
) to authenticated;

create or replace function public.update_member_birth_date(
  target_organization_id uuid,
  target_membership_id uuid,
  new_birth_date date
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
  set birth_date = new_birth_date
  where id = selected_person.id;

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
    jsonb_build_object('birth_date', selected_person.birth_date),
    jsonb_build_object('birth_date', new_birth_date)
  );
end;
$$;

grant execute on function public.update_member_birth_date(uuid, uuid, date)
to authenticated;

drop view public.public_event_entry_options;

create view public.public_event_entry_options
with (security_invoker = false)
as
select
  organization.id as organization_id,
  organization.slug as organization_slug,
  coalesce(organization.public_name, organization.name) as organization_name,
  organization.logo_path,
  organization.brand_primary,
  organization.brand_accent,
  organization.allow_guest_entries,
  roping.id as roping_id,
  roping.slug as roping_slug,
  roping.title,
  roping.venue_name,
  roping.address,
  roping.starts_at,
  roping.ends_at,
  roping.entries_open_at,
  roping.entries_close_at,
  roping.status,
  (
    roping.is_public = true
    and roping.status not in ('entries_closed', 'in_progress', 'completed', 'cancelled')
    and (roping.entries_open_at is null or roping.entries_open_at <= now())
    and (roping.entries_close_at is null or roping.entries_close_at > now())
  ) as entries_are_open,
  division.id as division_id,
  division.name as division_name,
  division.description as division_description,
  division.starts_at as division_starts_at,
  division.scheduled_date,
  division.schedule_type,
  division.schedule_note,
  division.incentive_enabled,
  division.maximum_entries_per_person,
  division.allow_guests,
  division.sort_order,
  classification.eligibility_type,
  classification.minimum_age,
  classification.maximum_age,
  coalesce(
    (
      select sum(fee.amount_cents)
      from public.roping_fees fee
      where fee.roping_id = roping.id
        and (fee.roping_division_id = division.id or fee.roping_division_id is null)
        and fee.is_required = true
    ),
    0
  )::integer as estimated_first_entry_cents
from public.organizations organization
join public.ropings roping on roping.organization_id = organization.id
join public.roping_divisions division on division.roping_id = roping.id
left join public.division_templates template on template.id = division.source_template_id
left join public.classifications classification on classification.id = template.classification_id
where roping.is_public = true;

revoke all on public.public_event_entry_options from public;
grant select on public.public_event_entry_options to anon, authenticated;
