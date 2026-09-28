create type public.entry_request_status as enum ('pending', 'accepted', 'declined');

create table public.online_entry_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null references public.ropings(id) on delete cascade,
  person_id uuid references public.people(id) on delete set null,
  membership_id uuid references public.organization_memberships(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone text,
  member_number text,
  status public.entry_request_status not null default 'pending',
  contestant_note text,
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint online_entry_request_event_same_organization
    foreign key (roping_id, organization_id) references public.ropings(id, organization_id),
  constraint online_entry_request_membership_same_organization
    foreign key (membership_id, organization_id) references public.organization_memberships(id, organization_id)
);

create table public.online_entry_request_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_id uuid not null references public.online_entry_requests(id) on delete cascade,
  roping_division_id uuid not null references public.roping_divisions(id) on delete cascade,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (request_id, roping_division_id),
  constraint online_entry_request_item_request_same_organization
    foreign key (request_id, organization_id) references public.online_entry_requests(id, organization_id),
  constraint online_entry_request_item_division_same_organization
    foreign key (roping_division_id, organization_id) references public.roping_divisions(id, organization_id)
);

create index online_entry_requests_event_status_idx
on public.online_entry_requests (roping_id, status, created_at desc);

create trigger online_entry_requests_set_updated_at
before update on public.online_entry_requests
for each row execute function public.set_updated_at();

alter table public.online_entry_requests enable row level security;
alter table public.online_entry_request_items enable row level security;

create policy "Organization users can read online entry requests"
on public.online_entry_requests for select
using (public.has_organization_access(organization_id));

create policy "Organization users can read online entry request items"
on public.online_entry_request_items for select
using (public.has_organization_access(organization_id));

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
  division.maximum_entries_per_person,
  division.allow_guests,
  division.sort_order,
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
where roping.is_public = true;

revoke all on public.public_event_entry_options from public;
grant select on public.public_event_entry_options to anon, authenticated;

create or replace function public.submit_online_entry_request(
  target_organization_slug text,
  target_roping_slug text,
  contestant_first_name text,
  contestant_last_name text,
  contestant_email text,
  contestant_phone text,
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
  organization_record public.organizations%rowtype;
  roping_record public.ropings%rowtype;
  selected_person_id uuid;
  selected_membership_id uuid;
  new_request_id uuid;
  item jsonb;
  division_record public.roping_divisions%rowtype;
  requested_quantity integer;
begin
  if nullif(trim(contestant_first_name), '') is null
    or nullif(trim(contestant_last_name), '') is null
    or nullif(trim(contestant_email), '') is null then
    raise exception 'Name and email are required';
  end if;

  if jsonb_typeof(requested_divisions) <> 'array'
    or jsonb_array_length(requested_divisions) = 0 then
    raise exception 'Select at least one division';
  end if;

  select * into organization_record
  from public.organizations
  where slug = target_organization_slug;

  select * into roping_record
  from public.ropings
  where organization_id = organization_record.id
    and slug = target_roping_slug
    and is_public = true;

  if roping_record.id is null then
    raise exception 'This event is not available for online entry';
  end if;

  if roping_record.status in ('entries_closed', 'in_progress', 'completed', 'cancelled')
    or (roping_record.entries_open_at is not null and roping_record.entries_open_at > now())
    or (roping_record.entries_close_at is not null and roping_record.entries_close_at <= now()) then
    raise exception 'Online entries are not open for this event';
  end if;

  if nullif(trim(contestant_member_number), '') is not null then
    select membership.id, membership.person_id
      into selected_membership_id, selected_person_id
    from public.organization_memberships membership
    join public.people person on person.id = membership.person_id
    where membership.organization_id = organization_record.id
      and membership.status = 'active'
      and lower(membership.member_number) = lower(trim(contestant_member_number))
      and lower(person.email) = lower(trim(contestant_email))
    limit 1;
  end if;

  for item in select * from jsonb_array_elements(requested_divisions)
  loop
    begin
      requested_quantity := (item ->> 'quantity')::integer;
    exception when others then
      raise exception 'Each division needs a valid entry quantity';
    end;

    select * into division_record
    from public.roping_divisions
    where id = (item ->> 'divisionId')::uuid
      and roping_id = roping_record.id;

    if division_record.id is null then
      raise exception 'One or more selected divisions are unavailable';
    end if;

    if requested_quantity < 1
      or (division_record.maximum_entries_per_person is not null
        and requested_quantity > division_record.maximum_entries_per_person) then
      raise exception 'The requested entry count exceeds the division limit';
    end if;

    if selected_membership_id is null
      and (not organization_record.allow_guest_entries or not division_record.allow_guests) then
      raise exception 'An active membership is required for one or more selected divisions';
    end if;
  end loop;

  if exists (
    select 1 from public.online_entry_requests request
    where request.roping_id = roping_record.id
      and lower(request.email) = lower(trim(contestant_email))
      and request.status = 'pending'
      and request.created_at > now() - interval '2 minutes'
  ) then
    raise exception 'An entry request was just submitted for this email address';
  end if;

  insert into public.online_entry_requests (
    organization_id,
    roping_id,
    person_id,
    membership_id,
    first_name,
    last_name,
    email,
    phone,
    member_number,
    contestant_note
  ) values (
    organization_record.id,
    roping_record.id,
    selected_person_id,
    selected_membership_id,
    trim(contestant_first_name),
    trim(contestant_last_name),
    lower(trim(contestant_email)),
    nullif(trim(contestant_phone), ''),
    nullif(trim(contestant_member_number), ''),
    nullif(trim(contestant_note), '')
  ) returning id into new_request_id;

  for item in select * from jsonb_array_elements(requested_divisions)
  loop
    insert into public.online_entry_request_items (
      organization_id,
      request_id,
      roping_division_id,
      quantity
    ) values (
      organization_record.id,
      new_request_id,
      (item ->> 'divisionId')::uuid,
      (item ->> 'quantity')::integer
    );
  end loop;

  return new_request_id;
end;
$$;

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
      insert into public.people (first_name, last_name, email, phone)
      values (
        request_record.first_name,
        request_record.last_name,
        request_record.email,
        request_record.phone
      ) returning id into selected_person_id;
    end if;

    for item_record in
      select * from public.online_entry_request_items
      where request_id = request_record.id
      order by created_at
    loop
      for entry_index in 1..item_record.quantity
      loop
        perform public.create_event_entry(
          item_record.roping_division_id,
          selected_person_id,
          'online'::public.entry_source,
          'unpaid'::public.payment_status
        );
        entries_created := entries_created + 1;
      end loop;
    end loop;

    update public.online_entry_requests
    set person_id = selected_person_id
    where id = request_record.id;
  end if;

  update public.online_entry_requests
  set
    status = review_decision,
    review_note = nullif(trim(entered_review_note), ''),
    reviewed_by = auth.uid(),
    reviewed_at = now()
  where id = request_record.id;

  return entries_created;
end;
$$;

create trigger audit_online_entry_requests
after insert or update or delete on public.online_entry_requests
for each row execute function public.write_audit_log();

grant execute on function public.submit_online_entry_request(text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.review_online_entry_request(uuid, public.entry_request_status, text) to authenticated;
