create type public.fee_kind as enum ('standard', 'insurance', 'side_pot', 'other');
create type public.payout_pool_type as enum ('main', 'side_pot');

create table public.payout_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  default_added_money_cents integer not null default 0 check (default_added_money_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create table public.payout_schedule_brackets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payout_schedule_id uuid not null,
  minimum_entries integer not null check (minimum_entries > 0),
  maximum_entries integer check (maximum_entries is null or maximum_entries >= minimum_entries),
  created_at timestamptz not null default now(),
  unique (payout_schedule_id, minimum_entries),
  unique (id, organization_id),
  foreign key (payout_schedule_id, organization_id) references public.payout_schedules(id, organization_id) on delete cascade
);

create table public.payout_schedule_places (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payout_bracket_id uuid not null,
  place_number integer not null check (place_number > 0),
  percentage_basis_points integer not null check (percentage_basis_points > 0 and percentage_basis_points <= 10000),
  created_at timestamptz not null default now(),
  unique (payout_bracket_id, place_number),
  foreign key (payout_bracket_id, organization_id) references public.payout_schedule_brackets(id, organization_id) on delete cascade
);

alter table public.division_templates
  add column payout_schedule_id uuid,
  add constraint division_template_payout_schedule_same_organization
    foreign key (payout_schedule_id, organization_id) references public.payout_schedules(id, organization_id) on delete set null;

alter table public.fee_templates
  add column kind public.fee_kind not null default 'standard',
  add column payout_schedule_id uuid,
  add constraint fee_template_payout_schedule_same_organization
    foreign key (payout_schedule_id, organization_id) references public.payout_schedules(id, organization_id) on delete set null;

alter table public.roping_fees
  add column kind public.fee_kind not null default 'standard';

create unique index one_entry_charge_per_fee
on public.entry_charges (entry_id, roping_fee_id)
where entry_id is not null;

create table public.roping_payout_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null,
  roping_division_id uuid not null,
  roping_fee_id uuid,
  source_schedule_id uuid references public.payout_schedules(id) on delete set null,
  name text not null,
  pool_type public.payout_pool_type not null,
  added_money_cents integer not null default 0 check (added_money_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (roping_id, organization_id) references public.ropings(id, organization_id) on delete cascade,
  foreign key (roping_division_id, organization_id) references public.roping_divisions(id, organization_id) on delete cascade,
  foreign key (roping_fee_id, organization_id) references public.roping_fees(id, organization_id) on delete cascade,
  check (
    (pool_type = 'main' and roping_fee_id is null)
    or (pool_type = 'side_pot' and roping_fee_id is not null)
  )
);

create unique index one_main_payout_plan_per_division
on public.roping_payout_plans (roping_division_id)
where pool_type = 'main';

create unique index one_side_pot_payout_plan_per_fee
on public.roping_payout_plans (roping_fee_id)
where pool_type = 'side_pot';

create table public.roping_payout_brackets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payout_plan_id uuid not null,
  minimum_entries integer not null check (minimum_entries > 0),
  maximum_entries integer check (maximum_entries is null or maximum_entries >= minimum_entries),
  created_at timestamptz not null default now(),
  unique (payout_plan_id, minimum_entries),
  unique (id, organization_id),
  foreign key (payout_plan_id, organization_id) references public.roping_payout_plans(id, organization_id) on delete cascade
);

create table public.roping_payout_places (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  payout_bracket_id uuid not null,
  place_number integer not null check (place_number > 0),
  percentage_basis_points integer not null check (percentage_basis_points > 0 and percentage_basis_points <= 10000),
  created_at timestamptz not null default now(),
  unique (payout_bracket_id, place_number),
  foreign key (payout_bracket_id, organization_id) references public.roping_payout_brackets(id, organization_id) on delete cascade
);

create trigger payout_schedules_set_updated_at before update on public.payout_schedules
for each row execute function public.set_updated_at();

create trigger roping_payout_plans_set_updated_at before update on public.roping_payout_plans
for each row execute function public.set_updated_at();

alter table public.payout_schedules enable row level security;
alter table public.payout_schedule_brackets enable row level security;
alter table public.payout_schedule_places enable row level security;
alter table public.roping_payout_plans enable row level security;
alter table public.roping_payout_brackets enable row level security;
alter table public.roping_payout_places enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'payout_schedules',
    'payout_schedule_brackets',
    'payout_schedule_places',
    'roping_payout_plans',
    'roping_payout_brackets',
    'roping_payout_places'
  ]
  loop
    execute format(
      'create policy "Organization users can read %1$s" on public.%1$I for select using (public.has_organization_access(organization_id))',
      table_name
    );
    execute format(
      'create policy "Organization managers can insert %1$s" on public.%1$I for insert with check (public.can_manage_organization(organization_id))',
      table_name
    );
    execute format(
      'create policy "Organization managers can update %1$s" on public.%1$I for update using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id))',
      table_name
    );
    execute format(
      'create policy "Organization managers can delete %1$s" on public.%1$I for delete using (public.can_manage_organization(organization_id))',
      table_name
    );
  end loop;
end;
$$;

create or replace function public.save_payout_schedule(
  target_organization_id uuid,
  target_schedule_id uuid,
  schedule_name text,
  schedule_description text,
  added_money_cents integer,
  schedule_brackets jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_schedule_id uuid;
  bracket jsonb;
  place jsonb;
  saved_bracket_id uuid;
  percentage_total integer;
  place_count integer;
  highest_place integer;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to manage payout schedules';
  end if;
  if nullif(trim(schedule_name), '') is null then
    raise exception 'Schedule name is required';
  end if;
  if added_money_cents < 0 then
    raise exception 'Added money cannot be negative';
  end if;
  if jsonb_typeof(schedule_brackets) <> 'array' or jsonb_array_length(schedule_brackets) = 0 then
    raise exception 'Add at least one payout bracket';
  end if;

  if target_schedule_id is null then
    insert into public.payout_schedules (organization_id, name, description, default_added_money_cents)
    values (target_organization_id, trim(schedule_name), nullif(trim(schedule_description), ''), added_money_cents)
    returning id into saved_schedule_id;
  else
    update public.payout_schedules
    set name = trim(schedule_name), description = nullif(trim(schedule_description), ''), default_added_money_cents = added_money_cents
    where id = target_schedule_id and organization_id = target_organization_id
    returning id into saved_schedule_id;
    if saved_schedule_id is null then raise exception 'Payout schedule not found'; end if;
    delete from public.payout_schedule_brackets where payout_schedule_id = saved_schedule_id;
  end if;

  for bracket in select * from jsonb_array_elements(schedule_brackets)
  loop
    if (bracket ->> 'minimumEntries')::integer < 1
      or ((bracket ->> 'maximumEntries') is not null and (bracket ->> 'maximumEntries') <> ''
        and (bracket ->> 'maximumEntries')::integer < (bracket ->> 'minimumEntries')::integer) then
      raise exception 'Each payout bracket needs a valid entry range';
    end if;

    select coalesce(sum((value ->> 'percentageBasisPoints')::integer), 0), count(*), coalesce(max((value ->> 'place')::integer), 0)
      into percentage_total, place_count, highest_place
    from jsonb_array_elements(bracket -> 'places');
    if percentage_total <> 10000 then raise exception 'Every payout bracket must total 100 percent'; end if;
    if place_count = 0 or highest_place <> place_count then raise exception 'Paid places must be consecutive starting with first'; end if;

    insert into public.payout_schedule_brackets (organization_id, payout_schedule_id, minimum_entries, maximum_entries)
    values (
      target_organization_id,
      saved_schedule_id,
      (bracket ->> 'minimumEntries')::integer,
      case when coalesce(bracket ->> 'maximumEntries', '') = '' then null else (bracket ->> 'maximumEntries')::integer end
    ) returning id into saved_bracket_id;

    for place in select * from jsonb_array_elements(bracket -> 'places')
    loop
      insert into public.payout_schedule_places (organization_id, payout_bracket_id, place_number, percentage_basis_points)
      values (target_organization_id, saved_bracket_id, (place ->> 'place')::integer, (place ->> 'percentageBasisPoints')::integer);
    end loop;
  end loop;

  if exists (
    select 1
    from public.payout_schedule_brackets first_bracket
    join public.payout_schedule_brackets second_bracket
      on second_bracket.payout_schedule_id = first_bracket.payout_schedule_id
     and second_bracket.id <> first_bracket.id
     and int4range(first_bracket.minimum_entries, coalesce(first_bracket.maximum_entries + 1, 2147483647), '[)')
       && int4range(second_bracket.minimum_entries, coalesce(second_bracket.maximum_entries + 1, 2147483647), '[)')
    where first_bracket.payout_schedule_id = saved_schedule_id
  ) then
    raise exception 'Payout entry ranges cannot overlap';
  end if;

  return saved_schedule_id;
end;
$$;

create or replace function public.copy_payout_schedule_to_event(
  target_organization_id uuid,
  target_roping_id uuid,
  target_division_id uuid,
  target_fee_id uuid,
  source_schedule_id uuid,
  plan_name text,
  target_pool_type public.payout_pool_type
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_plan_id uuid;
  source_bracket record;
  new_bracket_id uuid;
  schedule_record public.payout_schedules%rowtype;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to copy payout schedules';
  end if;
  select * into schedule_record from public.payout_schedules
  where id = source_schedule_id and organization_id = target_organization_id and is_active = true;
  if schedule_record.id is null then raise exception 'Payout schedule is unavailable'; end if;

  insert into public.roping_payout_plans (
    organization_id, roping_id, roping_division_id, roping_fee_id, source_schedule_id, name, pool_type, added_money_cents
  ) values (
    target_organization_id, target_roping_id, target_division_id, target_fee_id, source_schedule_id, plan_name, target_pool_type, schedule_record.default_added_money_cents
  ) returning id into new_plan_id;

  for source_bracket in
    select * from public.payout_schedule_brackets
    where payout_schedule_id = source_schedule_id
    order by minimum_entries
  loop
    insert into public.roping_payout_brackets (organization_id, payout_plan_id, minimum_entries, maximum_entries)
    values (target_organization_id, new_plan_id, source_bracket.minimum_entries, source_bracket.maximum_entries)
    returning id into new_bracket_id;

    insert into public.roping_payout_places (organization_id, payout_bracket_id, place_number, percentage_basis_points)
    select target_organization_id, new_bracket_id, place_number, percentage_basis_points
    from public.payout_schedule_places
    where payout_bracket_id = source_bracket.id;
  end loop;

  return new_plan_id;
end;
$$;

create or replace function public.add_entry_option(target_entry_id uuid, target_roping_fee_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_record public.entries%rowtype;
  fee_record public.roping_fees%rowtype;
  charge_id uuid;
begin
  select * into entry_record from public.entries where id = target_entry_id;
  if entry_record.id is null or not public.can_manage_organization(entry_record.organization_id) then
    raise exception 'You do not have permission to update this entry';
  end if;
  select * into fee_record from public.roping_fees
  where id = target_roping_fee_id
    and organization_id = entry_record.organization_id
    and roping_id = entry_record.roping_id
    and (roping_division_id is null or roping_division_id = entry_record.roping_division_id)
    and is_required = false;
  if fee_record.id is null then raise exception 'Entry option is unavailable'; end if;

  if fee_record.scope = 'entry' then
    select id into charge_id from public.entry_charges
    where entry_id = entry_record.id and roping_fee_id = fee_record.id;
    if charge_id is null then
      insert into public.entry_charges (organization_id, roping_id, person_id, entry_id, roping_fee_id, title, amount_cents)
      values (entry_record.organization_id, entry_record.roping_id, entry_record.person_id, entry_record.id, fee_record.id, fee_record.title, fee_record.amount_cents)
      returning id into charge_id;
    end if;
  else
    select id into charge_id from public.entry_charges
    where roping_id = entry_record.roping_id and person_id = entry_record.person_id and roping_fee_id = fee_record.id and entry_id is null;
    if charge_id is null then
      insert into public.entry_charges (organization_id, roping_id, person_id, entry_id, roping_fee_id, title, amount_cents)
      values (entry_record.organization_id, entry_record.roping_id, entry_record.person_id, null, fee_record.id, fee_record.title, fee_record.amount_cents)
      returning id into charge_id;
    end if;
  end if;
  return charge_id;
end;
$$;

create or replace function public.calculate_roping_payouts(target_plan_id uuid)
returns table (
  entry_count integer,
  pool_cents bigint,
  place_number integer,
  percentage_basis_points integer,
  payout_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  plan_record public.roping_payout_plans%rowtype;
  calculated_entries integer;
  calculated_pool bigint;
  selected_bracket_id uuid;
begin
  select * into plan_record from public.roping_payout_plans where id = target_plan_id;
  if plan_record.id is null or not public.has_organization_access(plan_record.organization_id) then
    raise exception 'Payout plan is unavailable';
  end if;

  if plan_record.pool_type = 'main' then
    select count(*)::integer into calculated_entries from public.entries where roping_division_id = plan_record.roping_division_id;
    select coalesce(sum(charge.amount_cents), 0) + plan_record.added_money_cents into calculated_pool
    from public.entry_charges charge
    join public.roping_fees fee on fee.id = charge.roping_fee_id
    left join public.entries entry on entry.id = charge.entry_id
    where fee.contributes_to_payout = true
      and fee.kind <> 'side_pot'
      and fee.roping_division_id = plan_record.roping_division_id
      and (entry.id is null or entry.roping_division_id = plan_record.roping_division_id)
      and charge.waived_at is null;
  else
    select count(*)::integer, coalesce(sum(amount_cents), 0) + plan_record.added_money_cents
      into calculated_entries, calculated_pool
    from public.entry_charges
    where roping_fee_id = plan_record.roping_fee_id and waived_at is null;
  end if;

  select id into selected_bracket_id
  from public.roping_payout_brackets
  where payout_plan_id = plan_record.id
    and calculated_entries >= minimum_entries
    and (maximum_entries is null or calculated_entries <= maximum_entries)
  order by minimum_entries desc
  limit 1;

  if selected_bracket_id is null then
    return query select calculated_entries, calculated_pool, null::integer, null::integer, null::bigint;
    return;
  end if;

  return query
  with amounts as (
    select
      place.place_number,
      place.percentage_basis_points,
      floor(calculated_pool * place.percentage_basis_points / 10000.0)::bigint as base_amount
    from public.roping_payout_places place
    where place.payout_bracket_id = selected_bracket_id
  ), totals as (
    select coalesce(sum(base_amount), 0)::bigint as allocated from amounts
  )
  select
    calculated_entries,
    calculated_pool,
    amounts.place_number,
    amounts.percentage_basis_points,
    amounts.base_amount + case when amounts.place_number = 1 then calculated_pool - totals.allocated else 0 end
  from amounts cross join totals
  order by amounts.place_number;
end;
$$;

grant execute on function public.save_payout_schedule(uuid, uuid, text, text, integer, jsonb) to authenticated;
grant execute on function public.add_entry_option(uuid, uuid) to authenticated;
grant execute on function public.calculate_roping_payouts(uuid) to authenticated;

create or replace function public.initialize_roping_payout_plans(target_roping_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  division_record record;
  fee_record record;
  plans_created integer := 0;
begin
  select organization_id into target_organization_id from public.ropings where id = target_roping_id;
  if target_organization_id is null or not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to initialize payout plans for this roping';
  end if;

  for division_record in
    select division.id, division.name, template.payout_schedule_id
    from public.roping_divisions division
    join public.division_templates template on template.id = division.source_template_id
    where division.roping_id = target_roping_id
      and template.payout_schedule_id is not null
      and not exists (select 1 from public.roping_payout_plans plan where plan.roping_division_id = division.id and plan.pool_type = 'main')
  loop
    perform public.copy_payout_schedule_to_event(target_organization_id, target_roping_id, division_record.id, null, division_record.payout_schedule_id, division_record.name, 'main');
    plans_created := plans_created + 1;
  end loop;

  for fee_record in
    select fee.id, fee.roping_division_id, fee.title, template.payout_schedule_id
    from public.roping_fees fee
    join public.fee_templates template on template.id = fee.source_template_id
    where fee.roping_id = target_roping_id
      and fee.kind = 'side_pot'
      and template.payout_schedule_id is not null
      and not exists (select 1 from public.roping_payout_plans plan where plan.roping_fee_id = fee.id)
  loop
    perform public.copy_payout_schedule_to_event(target_organization_id, target_roping_id, fee_record.roping_division_id, fee_record.id, fee_record.payout_schedule_id, fee_record.title, 'side_pot');
    plans_created := plans_created + 1;
  end loop;
  return plans_created;
end;
$$;

grant execute on function public.initialize_roping_payout_plans(uuid) to authenticated;

alter table public.online_entry_request_items
  add constraint online_entry_request_items_id_organization_unique unique (id, organization_id);

create table public.online_entry_request_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  request_item_id uuid not null,
  roping_fee_id uuid not null,
  created_at timestamptz not null default now(),
  unique (request_item_id, roping_fee_id),
  foreign key (request_item_id, organization_id) references public.online_entry_request_items(id, organization_id) on delete cascade,
  foreign key (roping_fee_id, organization_id) references public.roping_fees(id, organization_id) on delete cascade
);

alter table public.online_entry_request_options enable row level security;
create policy "Organization users can read online entry request options"
on public.online_entry_request_options for select
using (public.has_organization_access(organization_id));

create view public.public_event_optional_fees
with (security_invoker = false)
as
select
  organization.slug as organization_slug,
  roping.slug as roping_slug,
  division.id as division_id,
  fee.id as fee_id,
  fee.title,
  fee.amount_cents,
  fee.kind,
  fee.scope
from public.organizations organization
join public.ropings roping on roping.organization_id = organization.id
join public.roping_divisions division on division.roping_id = roping.id
join public.roping_fees fee on fee.roping_id = roping.id
  and (fee.roping_division_id = division.id or fee.roping_division_id is null)
where roping.is_public = true and fee.is_required = false;

revoke all on public.public_event_optional_fees from public;
grant select on public.public_event_optional_fees to anon, authenticated;

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
  new_request_item_id uuid;
  item jsonb;
  option_value jsonb;
  division_record public.roping_divisions%rowtype;
  option_record public.roping_fees%rowtype;
  requested_quantity integer;
begin
  if nullif(trim(contestant_first_name), '') is null or nullif(trim(contestant_last_name), '') is null or nullif(trim(contestant_email), '') is null then raise exception 'Name and email are required'; end if;
  if jsonb_typeof(requested_divisions) <> 'array' or jsonb_array_length(requested_divisions) = 0 then raise exception 'Select at least one division'; end if;
  select * into organization_record from public.organizations where slug = target_organization_slug;
  select * into roping_record from public.ropings where organization_id = organization_record.id and slug = target_roping_slug and is_public = true;
  if roping_record.id is null then raise exception 'This event is not available for online entry'; end if;
  if roping_record.status in ('entries_closed', 'in_progress', 'completed', 'cancelled')
    or (roping_record.entries_open_at is not null and roping_record.entries_open_at > now())
    or (roping_record.entries_close_at is not null and roping_record.entries_close_at <= now()) then raise exception 'Online entries are not open for this event'; end if;

  if nullif(trim(contestant_member_number), '') is not null then
    select membership.id, membership.person_id into selected_membership_id, selected_person_id
    from public.organization_memberships membership join public.people person on person.id = membership.person_id
    where membership.organization_id = organization_record.id and membership.status = 'active'
      and lower(membership.member_number) = lower(trim(contestant_member_number)) and lower(person.email) = lower(trim(contestant_email)) limit 1;
  end if;

  for item in select * from jsonb_array_elements(requested_divisions)
  loop
    begin requested_quantity := (item ->> 'quantity')::integer; exception when others then raise exception 'Each division needs a valid entry quantity'; end;
    select * into division_record from public.roping_divisions where id = (item ->> 'divisionId')::uuid and roping_id = roping_record.id;
    if division_record.id is null then raise exception 'One or more selected divisions are unavailable'; end if;
    if requested_quantity < 1 or (division_record.maximum_entries_per_person is not null and requested_quantity > division_record.maximum_entries_per_person) then raise exception 'The requested entry count exceeds the division limit'; end if;
    if selected_membership_id is null and (not organization_record.allow_guest_entries or not division_record.allow_guests) then raise exception 'An active membership is required for one or more selected divisions'; end if;
    if jsonb_typeof(coalesce(item -> 'optionIds', '[]'::jsonb)) <> 'array' then raise exception 'Entry options are invalid'; end if;
    for option_value in select * from jsonb_array_elements(coalesce(item -> 'optionIds', '[]'::jsonb))
    loop
      select * into option_record from public.roping_fees
      where id = trim(both '"' from option_value::text)::uuid and roping_id = roping_record.id and is_required = false
        and (roping_division_id is null or roping_division_id = division_record.id);
      if option_record.id is null then raise exception 'One or more entry options are unavailable'; end if;
    end loop;
  end loop;

  if exists (select 1 from public.online_entry_requests request where request.roping_id = roping_record.id and lower(request.email) = lower(trim(contestant_email)) and request.status = 'pending' and request.created_at > now() - interval '2 minutes') then raise exception 'An entry request was just submitted for this email address'; end if;

  insert into public.online_entry_requests (organization_id, roping_id, person_id, membership_id, first_name, last_name, email, phone, member_number, contestant_note)
  values (organization_record.id, roping_record.id, selected_person_id, selected_membership_id, trim(contestant_first_name), trim(contestant_last_name), lower(trim(contestant_email)), nullif(trim(contestant_phone), ''), nullif(trim(contestant_member_number), ''), nullif(trim(contestant_note), ''))
  returning id into new_request_id;

  for item in select * from jsonb_array_elements(requested_divisions)
  loop
    insert into public.online_entry_request_items (organization_id, request_id, roping_division_id, quantity)
    values (organization_record.id, new_request_id, (item ->> 'divisionId')::uuid, (item ->> 'quantity')::integer)
    returning id into new_request_item_id;
    for option_value in select * from jsonb_array_elements(coalesce(item -> 'optionIds', '[]'::jsonb))
    loop
      insert into public.online_entry_request_options (organization_id, request_item_id, roping_fee_id)
      values (organization_record.id, new_request_item_id, trim(both '"' from option_value::text)::uuid);
    end loop;
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
  option_record public.online_entry_request_options%rowtype;
  new_entry_id uuid;
  entry_index integer;
  entries_created integer := 0;
begin
  select * into request_record from public.online_entry_requests where id = target_request_id for update;
  if request_record.id is null or not public.can_manage_organization(request_record.organization_id) then raise exception 'You do not have permission to review this request'; end if;
  if request_record.status <> 'pending' then raise exception 'This request has already been reviewed'; end if;
  if review_decision not in ('accepted', 'declined') then raise exception 'Choose accepted or declined'; end if;
  if review_decision = 'accepted' then
    selected_person_id := request_record.person_id;
    if selected_person_id is null then select id into selected_person_id from public.people where lower(email) = lower(request_record.email) limit 1; end if;
    if selected_person_id is null then insert into public.people (first_name, last_name, email, phone) values (request_record.first_name, request_record.last_name, request_record.email, request_record.phone) returning id into selected_person_id; end if;
    for item_record in select * from public.online_entry_request_items where request_id = request_record.id order by created_at
    loop
      for entry_index in 1..item_record.quantity
      loop
        new_entry_id := public.create_event_entry(item_record.roping_division_id, selected_person_id, 'online'::public.entry_source, 'unpaid'::public.payment_status);
        for option_record in select * from public.online_entry_request_options where request_item_id = item_record.id
        loop
          perform public.add_entry_option(new_entry_id, option_record.roping_fee_id);
        end loop;
        entries_created := entries_created + 1;
      end loop;
    end loop;
    update public.online_entry_requests set person_id = selected_person_id where id = request_record.id;
  end if;
  update public.online_entry_requests set status = review_decision, review_note = nullif(trim(entered_review_note), ''), reviewed_by = auth.uid(), reviewed_at = now() where id = request_record.id;
  return entries_created;
end;
$$;

create trigger audit_payout_schedules after insert or update or delete on public.payout_schedules
for each row execute function public.write_audit_log();
create trigger audit_payout_plans after insert or update or delete on public.roping_payout_plans
for each row execute function public.write_audit_log();

create or replace function public.create_roping_from_templates(
  target_organization_id uuid,
  event_title text,
  event_slug text,
  event_venue_name text,
  event_address text,
  event_starts_at_local timestamp without time zone,
  event_entries_open_at_local timestamp without time zone,
  event_entries_close_at_local timestamp without time zone,
  event_is_public boolean,
  selected_division_template_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_roping_id uuid;
  new_roping_division_id uuid;
  new_roping_fee_id uuid;
  organization_timezone text;
  division_record public.division_templates%rowtype;
  fee_record public.fee_templates%rowtype;
  selected_count integer := 0;
begin
  if not public.can_manage_organization(target_organization_id) then raise exception 'You do not have permission to create events for this organization'; end if;
  if coalesce(array_length(selected_division_template_ids, 1), 0) = 0 then raise exception 'Select at least one division'; end if;
  select timezone into organization_timezone from public.organizations where id = target_organization_id;

  insert into public.ropings (organization_id, title, slug, venue_name, address, starts_at, entries_open_at, entries_close_at, status, is_public)
  values (
    target_organization_id, trim(event_title), trim(event_slug), nullif(trim(event_venue_name), ''), nullif(trim(event_address), ''),
    event_starts_at_local at time zone organization_timezone,
    case when event_entries_open_at_local is null then null else event_entries_open_at_local at time zone organization_timezone end,
    case when event_entries_close_at_local is null then null else event_entries_close_at_local at time zone organization_timezone end,
    case when event_entries_open_at_local is not null and event_entries_open_at_local at time zone organization_timezone <= now()
      and (event_entries_close_at_local is null or event_entries_close_at_local at time zone organization_timezone > now())
      then 'entries_open'::public.roping_status else 'scheduled'::public.roping_status end,
    event_is_public
  ) returning id into new_roping_id;

  for division_record in
    select * from public.division_templates
    where organization_id = target_organization_id and is_active = true and id = any(selected_division_template_ids)
    order by sort_order, created_at
  loop
    selected_count := selected_count + 1;
    insert into public.roping_divisions (organization_id, roping_id, source_template_id, name, description, number_of_runs, maximum_entries_per_person, allow_guests, eligibility_rules, scoring_rules, sort_order)
    values (target_organization_id, new_roping_id, division_record.id, division_record.name, division_record.description, division_record.number_of_runs, division_record.maximum_entries_per_person, division_record.allow_guests, division_record.eligibility_rules, division_record.scoring_rules, division_record.sort_order)
    returning id into new_roping_division_id;

    if division_record.payout_schedule_id is not null then
      perform public.copy_payout_schedule_to_event(target_organization_id, new_roping_id, new_roping_division_id, null, division_record.payout_schedule_id, division_record.name, 'main');
    end if;

    for fee_record in select * from public.fee_templates where division_template_id = division_record.id order by sort_order, created_at
    loop
      insert into public.roping_fees (organization_id, roping_id, roping_division_id, source_template_id, title, amount_cents, scope, included_in_entry_price, contributes_to_payout, is_required, sort_order, kind)
      values (target_organization_id, new_roping_id, new_roping_division_id, fee_record.id, fee_record.title, fee_record.amount_cents, fee_record.scope, fee_record.included_in_entry_price, fee_record.contributes_to_payout, fee_record.is_required, fee_record.sort_order, fee_record.kind)
      returning id into new_roping_fee_id;
      if fee_record.kind = 'side_pot' and fee_record.payout_schedule_id is not null then
        perform public.copy_payout_schedule_to_event(target_organization_id, new_roping_id, new_roping_division_id, new_roping_fee_id, fee_record.payout_schedule_id, fee_record.title, 'side_pot');
      end if;
    end loop;
  end loop;

  if selected_count <> array_length(selected_division_template_ids, 1) then raise exception 'One or more selected divisions are unavailable'; end if;

  insert into public.roping_fees (
    organization_id, roping_id, roping_division_id, source_template_id, title, amount_cents,
    scope, included_in_entry_price, contributes_to_payout, is_required, sort_order, kind
  )
  select
    target_organization_id, new_roping_id, null, fee.id, fee.title, fee.amount_cents,
    fee.scope, fee.included_in_entry_price, fee.contributes_to_payout, fee.is_required, fee.sort_order, fee.kind
  from public.fee_templates fee
  where fee.organization_id = target_organization_id and fee.division_template_id is null;

  return new_roping_id;
end;
$$;

revoke all on function public.copy_payout_schedule_to_event(uuid, uuid, uuid, uuid, uuid, text, public.payout_pool_type) from public;
