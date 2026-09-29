alter table public.ropings
  add column ends_at timestamptz;

alter table public.roping_divisions
  add column starts_at timestamptz,
  add column incentive_enabled boolean not null default false;

update public.roping_divisions division
set starts_at = roping.starts_at,
    incentive_enabled = roping.incentive_enabled
from public.ropings roping
where roping.id = division.roping_id;

alter table public.roping_incentive_rules
  add column roping_division_id uuid;

alter table public.roping_incentive_rules
  drop constraint roping_incentive_rules_roping_id_classification_id_key;

update public.roping_incentive_rules rule
set roping_division_id = (
  select division.id
  from public.roping_divisions division
  where division.roping_id = rule.roping_id
  order by division.sort_order, division.created_at
  limit 1
);

insert into public.roping_incentive_rules (
  organization_id,
  roping_id,
  roping_division_id,
  classification_id,
  adjustment_seconds
)
select
  rule.organization_id,
  rule.roping_id,
  division.id,
  rule.classification_id,
  rule.adjustment_seconds
from public.roping_incentive_rules rule
join public.roping_divisions division on division.roping_id = rule.roping_id
where division.id <> rule.roping_division_id;

alter table public.roping_incentive_rules
  alter column roping_division_id set not null,
  add constraint roping_incentive_rule_class_same_organization
    foreign key (roping_division_id, organization_id)
    references public.roping_divisions(id, organization_id) on delete cascade,
  add constraint roping_incentive_rule_classification_unique
    unique (roping_division_id, classification_id);

drop index public.roping_incentive_rules_event_idx;
create index roping_incentive_rules_class_idx
on public.roping_incentive_rules (roping_division_id, classification_id);

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
    raise exception 'You do not have permission to add entries to this class';
  end if;

  select id into selected_membership_id
  from public.organization_memberships
  where organization_id = division_record.organization_id
    and person_id = target_person_id
    and status = 'active'
  limit 1;

  if selected_membership_id is null and not division_record.allow_guests then
    raise exception 'This class requires an active membership';
  end if;

  if selected_membership_id is not null and division_record.incentive_enabled then
    select rule.classification_id, rule.adjustment_seconds
      into selected_classification_id, selected_adjustment
    from public.roping_incentive_rules rule
    join public.member_classifications member_classification
      on member_classification.classification_id = rule.classification_id
     and member_classification.membership_id = selected_membership_id
     and member_classification.ended_on is null
     and member_classification.effective_on <= current_date
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
    organization_id, roping_id, roping_division_id, person_id, membership_id,
    entry_number, source, payment_status, incentive_classification_id,
    incentive_adjustment_seconds
  ) values (
    division_record.organization_id, division_record.roping_id, division_record.id,
    target_person_id, selected_membership_id, existing_entry_count + 1,
    entry_origin, initial_payment_status, selected_classification_id,
    coalesce(selected_adjustment, 0)
  ) returning id into new_entry_id;

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
      where charge.roping_id = division_record.roping_id
        and charge.person_id = target_person_id
        and charge.roping_fee_id = fee_record.id
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

create or replace function public.create_roping_with_class_settings(
  target_organization_id uuid,
  event_title text,
  event_slug text,
  event_venue_name text,
  event_address text,
  event_starts_at_local timestamp without time zone,
  event_ends_at_local timestamp without time zone,
  event_entries_open_at_local timestamp without time zone,
  event_entries_close_at_local timestamp without time zone,
  event_is_public boolean,
  selected_division_template_ids uuid[],
  event_round_counts jsonb,
  event_short_round_enabled boolean,
  event_short_round_brackets jsonb,
  event_class_settings jsonb,
  event_fee_title text,
  event_fee_amount_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_roping_id uuid;
  organization_timezone text;
  class_setting jsonb;
  rule jsonb;
  target_template_id uuid;
  target_division_id uuid;
  target_classification_id uuid;
  target_adjustment numeric(8, 3);
  target_class_starts_at timestamp without time zone;
begin
  select timezone into organization_timezone
  from public.organizations
  where id = target_organization_id;

  if event_ends_at_local is not null and event_ends_at_local < event_starts_at_local then
    raise exception 'The event end must be after the event start';
  end if;

  new_roping_id := public.create_roping_with_short_rounds(
    target_organization_id,
    event_title,
    event_slug,
    event_venue_name,
    event_address,
    event_starts_at_local,
    event_entries_open_at_local,
    event_entries_close_at_local,
    event_is_public,
    selected_division_template_ids,
    false,
    '[]'::jsonb,
    event_round_counts,
    event_short_round_enabled,
    event_short_round_brackets
  );

  update public.ropings
  set ends_at = case
    when event_ends_at_local is null then null
    else event_ends_at_local at time zone organization_timezone
  end
  where id = new_roping_id;

  if jsonb_typeof(event_class_settings) <> 'array' then
    raise exception 'Class settings must be provided for the selected templates';
  end if;

  for class_setting in select * from jsonb_array_elements(event_class_settings)
  loop
    target_template_id := (class_setting ->> 'divisionTemplateId')::uuid;
    if target_template_id <> all(selected_division_template_ids) then
      raise exception 'A class setting does not match a selected template';
    end if;

    select id into target_division_id
    from public.roping_divisions
    where roping_id = new_roping_id and source_template_id = target_template_id;

    target_class_starts_at := nullif(class_setting ->> 'startsAt', '')::timestamp;
    update public.roping_divisions
    set starts_at = coalesce(
      target_class_starts_at at time zone organization_timezone,
      (select starts_at from public.ropings where id = new_roping_id)
    ),
    incentive_enabled = coalesce((class_setting ->> 'incentiveEnabled')::boolean, false)
    where id = target_division_id;

    if coalesce((class_setting ->> 'incentiveEnabled')::boolean, false) then
      if jsonb_typeof(class_setting -> 'incentiveRules') <> 'array'
        or jsonb_array_length(class_setting -> 'incentiveRules') = 0 then
        raise exception 'Each incentive class needs at least one handicap rule';
      end if;

      for rule in select * from jsonb_array_elements(class_setting -> 'incentiveRules')
      loop
        target_classification_id := (rule ->> 'classificationId')::uuid;
        target_adjustment := round((rule ->> 'adjustmentSeconds')::numeric, 3);
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
          organization_id, roping_id, roping_division_id,
          classification_id, adjustment_seconds
        ) values (
          target_organization_id, new_roping_id, target_division_id,
          target_classification_id, target_adjustment
        );
      end loop;
    end if;
  end loop;

  update public.ropings
  set incentive_enabled = exists (
    select 1 from public.roping_divisions
    where roping_id = new_roping_id and incentive_enabled = true
  )
  where id = new_roping_id;

  if nullif(trim(event_fee_title), '') is not null then
    if event_fee_amount_cents is null or event_fee_amount_cents < 0 then
      raise exception 'Enter a valid event-wide charge amount';
    end if;
    insert into public.roping_fees (
      organization_id, roping_id, roping_division_id, title, amount_cents,
      scope, included_in_entry_price, contributes_to_payout, is_required, kind
    ) values (
      target_organization_id, new_roping_id, null, trim(event_fee_title),
      event_fee_amount_cents, 'contestant_event', false, false, true, 'standard'
    );
  end if;

  return new_roping_id;
end;
$$;

revoke all on function public.create_roping_with_class_settings(
  uuid, text, text, text, text, timestamp, timestamp, timestamp, timestamp,
  boolean, uuid[], jsonb, boolean, jsonb, jsonb, text, integer
) from public;
grant execute on function public.create_roping_with_class_settings(
  uuid, text, text, text, text, timestamp, timestamp, timestamp, timestamp,
  boolean, uuid[], jsonb, boolean, jsonb, jsonb, text, integer
) to authenticated;

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
  division.incentive_enabled,
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
