alter table public.ropings
  add column incentive_enabled boolean not null default false;

alter table public.entries
  add column incentive_classification_id uuid,
  add column incentive_adjustment_seconds numeric(8, 3) not null default 0
    check (incentive_adjustment_seconds >= 0);

alter table public.entries
  add constraint entries_incentive_classification_same_organization
  foreign key (incentive_classification_id, organization_id)
  references public.classifications(id, organization_id);

create table public.roping_incentive_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null,
  classification_id uuid not null,
  adjustment_seconds numeric(8, 3) not null check (adjustment_seconds > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (roping_id, classification_id),
  unique (id, organization_id),
  foreign key (roping_id, organization_id)
    references public.ropings(id, organization_id) on delete cascade,
  foreign key (classification_id, organization_id)
    references public.classifications(id, organization_id)
);

create index roping_incentive_rules_event_idx
on public.roping_incentive_rules (roping_id, classification_id);

create trigger roping_incentive_rules_set_updated_at
before update on public.roping_incentive_rules
for each row execute function public.set_updated_at();

alter table public.roping_incentive_rules enable row level security;

create policy "Organization users can read roping incentive rules"
on public.roping_incentive_rules for select
using (public.has_organization_access(organization_id));

create policy "Organization managers can insert roping incentive rules"
on public.roping_incentive_rules for insert
with check (public.can_manage_organization(organization_id));

create policy "Organization managers can update roping incentive rules"
on public.roping_incentive_rules for update
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy "Organization managers can delete roping incentive rules"
on public.roping_incentive_rules for delete
using (public.can_manage_organization(organization_id));

create trigger audit_roping_incentive_rules
after insert or update or delete on public.roping_incentive_rules
for each row execute function public.write_audit_log();

create or replace function public.create_roping_with_incentives(
  target_organization_id uuid,
  event_title text,
  event_slug text,
  event_venue_name text,
  event_address text,
  event_starts_at_local timestamp without time zone,
  event_entries_open_at_local timestamp without time zone,
  event_entries_close_at_local timestamp without time zone,
  event_is_public boolean,
  selected_division_template_ids uuid[],
  event_incentive_enabled boolean,
  event_incentive_rules jsonb,
  event_round_counts jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_roping_id uuid;
  rule jsonb;
  target_classification_id uuid;
  target_adjustment numeric(8, 3);
  round_setting jsonb;
  target_template_id uuid;
  target_round_count integer;
  configured_round_count integer := 0;
  configured_template_ids uuid[] := '{}'::uuid[];
begin
  new_roping_id := public.create_roping_from_templates(
    target_organization_id,
    event_title,
    event_slug,
    event_venue_name,
    event_address,
    event_starts_at_local,
    event_entries_open_at_local,
    event_entries_close_at_local,
    event_is_public,
    selected_division_template_ids
  );

  if jsonb_typeof(event_round_counts) <> 'array' then
    raise exception 'Round counts must be provided for the selected entry classes';
  end if;

  for round_setting in select * from jsonb_array_elements(event_round_counts)
  loop
    begin
      target_template_id := (round_setting ->> 'divisionTemplateId')::uuid;
      target_round_count := (round_setting ->> 'roundCount')::integer;
    exception when others then
      raise exception 'Each selected entry class needs a valid round count';
    end;

    if target_template_id <> all(selected_division_template_ids)
      or target_round_count < 1
      or target_round_count > 20 then
      raise exception 'Round counts must be between 1 and 20 for every selected entry class';
    end if;

    if target_template_id = any(configured_template_ids) then
      raise exception 'Each selected entry class can have only one round count';
    end if;

    update public.roping_divisions
    set number_of_runs = target_round_count
    where roping_id = new_roping_id
      and source_template_id = target_template_id;

    if not found then
      raise exception 'A selected entry class is unavailable';
    end if;

    configured_round_count := configured_round_count + 1;
    configured_template_ids := array_append(configured_template_ids, target_template_id);
  end loop;

  if configured_round_count <> array_length(selected_division_template_ids, 1) then
    raise exception 'Set the round count for every selected entry class';
  end if;

  if event_incentive_enabled then
    if jsonb_typeof(event_incentive_rules) <> 'array'
      or jsonb_array_length(event_incentive_rules) = 0 then
      raise exception 'Add at least one classification handicap for an incentive roping';
    end if;

    update public.ropings
    set incentive_enabled = true
    where id = new_roping_id;

    for rule in select * from jsonb_array_elements(event_incentive_rules)
    loop
      begin
        target_classification_id := (rule ->> 'classificationId')::uuid;
        target_adjustment := round((rule ->> 'adjustmentSeconds')::numeric, 3);
      exception when others then
        raise exception 'Each incentive handicap needs a valid classification and time adjustment';
      end;

      if target_adjustment <= 0 or target_adjustment > 60 then
        raise exception 'Incentive adjustments must be greater than zero and no more than 60 seconds';
      end if;

      if not exists (
        select 1 from public.classifications
        where id = target_classification_id
          and organization_id = target_organization_id
          and is_active = true
      ) then
        raise exception 'An incentive classification is unavailable in this organization';
      end if;

      insert into public.roping_incentive_rules (
        organization_id,
        roping_id,
        classification_id,
        adjustment_seconds
      ) values (
        target_organization_id,
        new_roping_id,
        target_classification_id,
        target_adjustment
      );
    end loop;
  end if;

  return new_roping_id;
end;
$$;

grant execute on function public.create_roping_with_incentives(
  uuid, text, text, text, text, timestamp, timestamp, timestamp,
  boolean, uuid[], boolean, jsonb, jsonb
) to authenticated;

revoke execute on function public.create_roping_from_templates(
  uuid, text, text, text, text, timestamp, timestamp, timestamp,
  boolean, uuid[]
) from authenticated;

create or replace function public.set_roping_round_count(
  target_roping_id uuid,
  new_round_count integer,
  target_roping_division_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.ropings%rowtype;
  updated_count integer;
begin
  select * into event_record
  from public.ropings
  where id = target_roping_id;

  if event_record.id is null or not public.can_manage_organization(event_record.organization_id) then
    raise exception 'You do not have permission to change rounds for this event';
  end if;

  if event_record.status in ('in_progress', 'completed', 'cancelled') then
    raise exception 'Round counts cannot change after an event has started';
  end if;

  if new_round_count < 1 or new_round_count > 20 then
    raise exception 'Round counts must be between 1 and 20';
  end if;

  if target_roping_division_id is not null and not exists (
    select 1 from public.roping_divisions
    where id = target_roping_division_id
      and roping_id = target_roping_id
      and organization_id = event_record.organization_id
  ) then
    raise exception 'That entry class is not part of this event';
  end if;

  if exists (
    select 1
    from public.runs run
    join public.roping_divisions division on division.id = run.roping_division_id
    where division.roping_id = target_roping_id
      and (target_roping_division_id is null or division.id = target_roping_division_id)
      and run.run_number > new_round_count
      and run.status <> 'pending'
  ) then
    raise exception 'A completed run exists above the requested round count';
  end if;

  delete from public.runs run
  using public.roping_divisions division
  where division.id = run.roping_division_id
    and division.roping_id = target_roping_id
    and (target_roping_division_id is null or division.id = target_roping_division_id)
    and run.run_number > new_round_count
    and run.status = 'pending';

  update public.roping_divisions
  set number_of_runs = new_round_count
  where roping_id = target_roping_id
    and (target_roping_division_id is null or id = target_roping_division_id);

  get diagnostics updated_count = row_count;

  insert into public.runs (organization_id, roping_division_id, entry_id, run_number)
  select
    entry.organization_id,
    entry.roping_division_id,
    entry.id,
    generated.run_number
  from public.entries entry
  join public.roping_divisions division on division.id = entry.roping_division_id
  cross join generate_series(1, new_round_count) as generated(run_number)
  where division.roping_id = target_roping_id
    and (target_roping_division_id is null or division.id = target_roping_division_id)
  on conflict (entry_id, run_number) do nothing;

  return updated_count;
end;
$$;

grant execute on function public.set_roping_round_count(uuid, integer, uuid) to authenticated;

update public.disciplines
set watch_threshold = null
where watch_threshold is not null;

create or replace function public.create_default_discipline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.disciplines (organization_id, name, description, watch_threshold, sort_order)
  values (new.id, 'Calf roping', 'Traditional calf roping classifications', null, 0);
  return new;
end;
$$;

create or replace function public.create_event_entry(
  target_roping_division_id uuid,
  target_person_id uuid,
  entry_origin public.entry_source default 'office',
  initial_payment_status public.payment_status default 'unpaid'
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

  if division_record.id is null or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to add entries to this entry class';
  end if;

  select id into selected_membership_id
  from public.organization_memberships
  where organization_id = division_record.organization_id
    and person_id = target_person_id
    and status = 'active'
  limit 1;

  if selected_membership_id is null and not division_record.allow_guests then
    raise exception 'This entry class requires an active membership';
  end if;

  if selected_membership_id is not null then
    select rule.classification_id, rule.adjustment_seconds
      into selected_classification_id, selected_adjustment
    from public.roping_incentive_rules rule
    join public.member_classifications member_classification
      on member_classification.classification_id = rule.classification_id
     and member_classification.membership_id = selected_membership_id
     and member_classification.ended_on is null
     and member_classification.effective_on <= current_date
    where rule.roping_id = division_record.roping_id
    order by rule.adjustment_seconds desc
    limit 1;
  end if;

  select count(*) into existing_entry_count
  from public.entries
  where roping_division_id = target_roping_division_id
    and person_id = target_person_id;

  if division_record.maximum_entries_per_person is not null
    and existing_entry_count >= division_record.maximum_entries_per_person then
    raise exception 'This contestant has reached the entry limit for this entry class';
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
    incentive_adjustment_seconds
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
    coalesce(selected_adjustment, 0)
  )
  returning id into new_entry_id;

  for fee_record in
    select * from public.roping_fees
    where roping_id = division_record.roping_id
      and (roping_division_id = division_record.id or roping_division_id is null)
      and is_required = true
    order by sort_order, created_at
  loop
    if fee_record.scope = 'entry' then
      insert into public.entry_charges (
        organization_id, roping_id, person_id, entry_id, roping_fee_id, title, amount_cents
      ) values (
        division_record.organization_id, division_record.roping_id, target_person_id,
        new_entry_id, fee_record.id, fee_record.title, fee_record.amount_cents
      );
    elsif not exists (
      select 1 from public.entry_charges charge
      join public.roping_fees charged_fee on charged_fee.id = charge.roping_fee_id
      where charge.roping_id = division_record.roping_id
        and charge.person_id = target_person_id
        and (
          charge.roping_fee_id = fee_record.id
          or (
            fee_record.scope = 'contestant_event'
            and fee_record.source_template_id is not null
            and charged_fee.source_template_id = fee_record.source_template_id
          )
        )
    ) then
      insert into public.entry_charges (
        organization_id, roping_id, person_id, entry_id, roping_fee_id, title, amount_cents
      ) values (
        division_record.organization_id, division_record.roping_id, target_person_id,
        null, fee_record.id, fee_record.title, fee_record.amount_cents
      );
    end if;
  end loop;

  for run_index in 1..division_record.number_of_runs loop
    insert into public.runs (organization_id, roping_division_id, entry_id, run_number)
    values (division_record.organization_id, division_record.id, new_entry_id, run_index);
  end loop;

  return new_entry_id;
end;
$$;

drop view public.public_live_results;

create view public.public_live_results
with (security_invoker = false)
as
select
  run.id as run_id,
  roping.organization_id,
  organization.slug as organization_slug,
  roping.slug as roping_slug,
  roping.title as roping_title,
  division.id as division_id,
  division.name as division_name,
  division.result_status,
  entry.entry_number,
  person.first_name,
  person.last_name,
  run.run_number,
  run.draw_position,
  run.raw_time_seconds,
  run.penalty_seconds,
  case
    when run.raw_time_seconds is null then null
    else greatest(run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds, 0)
  end as total_time_seconds,
  run.status,
  run.recorded_at,
  entry.incentive_adjustment_seconds
from public.runs run
join public.entries entry on entry.id = run.entry_id
join public.people person on person.id = entry.person_id
join public.roping_divisions division on division.id = run.roping_division_id
join public.ropings roping on roping.id = division.roping_id
join public.organizations organization on organization.id = roping.organization_id
where roping.is_public = true and run.status <> 'pending';

revoke all on public.public_live_results from public;
grant select on public.public_live_results to anon, authenticated;

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
  )::integer as estimated_first_entry_cents,
  roping.incentive_enabled
from public.organizations organization
join public.ropings roping on roping.organization_id = organization.id
join public.roping_divisions division on division.roping_id = roping.id
where roping.is_public = true;

revoke all on public.public_event_entry_options from public;
grant select on public.public_event_entry_options to anon, authenticated;
