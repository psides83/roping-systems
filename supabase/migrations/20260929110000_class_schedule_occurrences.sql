create type public.class_schedule_type as enum ('fixed', 'tentative', 'follows_previous');

alter table public.roping_divisions
  add column scheduled_date date,
  add column schedule_type public.class_schedule_type not null default 'fixed',
  add column schedule_note text,
  drop constraint roping_divisions_roping_id_name_key;

update public.roping_divisions division
set scheduled_date = (coalesce(division.starts_at, roping.starts_at) at time zone organization.timezone)::date
from public.ropings roping
join public.organizations organization on organization.id = roping.organization_id
where roping.id = division.roping_id;

alter table public.roping_divisions
  alter column scheduled_date set not null;

create index roping_divisions_schedule_idx
on public.roping_divisions (roping_id, scheduled_date, sort_order);

create or replace function public.create_roping_with_schedule(
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
  event_class_occurrences jsonb,
  event_short_round_enabled boolean,
  event_short_round_brackets jsonb,
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
  new_division_id uuid;
  new_fee_id uuid;
  organization_timezone text;
  occurrence jsonb;
  incentive_rule jsonb;
  template_record public.division_templates%rowtype;
  fee_record public.fee_templates%rowtype;
  template_id uuid;
  occurrence_date date;
  occurrence_starts_at timestamp without time zone;
  occurrence_schedule_type public.class_schedule_type;
  occurrence_round_count integer;
  occurrence_sort_order integer := 0;
  occurrence_incentive_enabled boolean;
  target_classification_id uuid;
  target_adjustment numeric(8, 3);
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to create events for this organization';
  end if;

  select timezone into organization_timezone
  from public.organizations
  where id = target_organization_id;

  if organization_timezone is null then
    raise exception 'Organization timezone is unavailable';
  end if;
  if event_ends_at_local is not null and event_ends_at_local < event_starts_at_local then
    raise exception 'The event end must be after the event start';
  end if;
  if jsonb_typeof(event_class_occurrences) <> 'array'
    or jsonb_array_length(event_class_occurrences) = 0 then
    raise exception 'Add at least one scheduled class roping';
  end if;

  insert into public.ropings (
    organization_id, title, slug, venue_name, address, starts_at, ends_at,
    entries_open_at, entries_close_at, status, is_public, incentive_enabled
  ) values (
    target_organization_id,
    trim(event_title),
    trim(event_slug),
    nullif(trim(event_venue_name), ''),
    nullif(trim(event_address), ''),
    event_starts_at_local at time zone organization_timezone,
    case when event_ends_at_local is null then null else event_ends_at_local at time zone organization_timezone end,
    case when event_entries_open_at_local is null then null else event_entries_open_at_local at time zone organization_timezone end,
    case when event_entries_close_at_local is null then null else event_entries_close_at_local at time zone organization_timezone end,
    case
      when event_entries_open_at_local is not null
        and event_entries_open_at_local at time zone organization_timezone <= now()
        and (event_entries_close_at_local is null or event_entries_close_at_local at time zone organization_timezone > now())
      then 'entries_open'::public.roping_status
      else 'scheduled'::public.roping_status
    end,
    event_is_public,
    false
  ) returning id into new_roping_id;

  for occurrence in select * from jsonb_array_elements(event_class_occurrences)
  loop
    template_id := (occurrence ->> 'templateId')::uuid;
    occurrence_date := (occurrence ->> 'scheduledDate')::date;
    occurrence_schedule_type := (occurrence ->> 'scheduleType')::public.class_schedule_type;
    occurrence_round_count := (occurrence ->> 'roundCount')::integer;
    occurrence_incentive_enabled := coalesce((occurrence ->> 'incentiveEnabled')::boolean, false);
    occurrence_sort_order := occurrence_sort_order + 1;

    if occurrence_round_count < 1 or occurrence_round_count > 20 then
      raise exception 'Main rounds must be between 1 and 20';
    end if;

    occurrence_starts_at := nullif(occurrence ->> 'startsAt', '')::timestamp;
    if occurrence_schedule_type in ('fixed', 'tentative') and occurrence_starts_at is null then
      raise exception 'Set or tentative schedules require a start time';
    end if;
    if occurrence_schedule_type = 'follows_previous' then
      occurrence_starts_at := null;
    end if;

    select * into template_record
    from public.division_templates
    where id = template_id
      and organization_id = target_organization_id
      and is_active = true;

    if template_record.id is null then
      raise exception 'A selected event template is unavailable';
    end if;

    insert into public.roping_divisions (
      organization_id, roping_id, source_template_id, name, description,
      number_of_runs, maximum_entries_per_person, allow_guests,
      eligibility_rules, scoring_rules, sort_order, starts_at, scheduled_date,
      schedule_type, schedule_note, incentive_enabled
    ) values (
      target_organization_id, new_roping_id, template_record.id,
      template_record.name, template_record.description, occurrence_round_count,
      template_record.maximum_entries_per_person, template_record.allow_guests,
      template_record.eligibility_rules, template_record.scoring_rules,
      occurrence_sort_order,
      case when occurrence_starts_at is null then null else occurrence_starts_at at time zone organization_timezone end,
      occurrence_date,
      occurrence_schedule_type,
      nullif(trim(occurrence ->> 'scheduleNote'), ''),
      occurrence_incentive_enabled
    ) returning id into new_division_id;

    if template_record.payout_schedule_id is not null then
      perform public.copy_payout_schedule_to_event(
        target_organization_id, new_roping_id, new_division_id, null,
        template_record.payout_schedule_id, template_record.name, 'main'
      );
    end if;

    for fee_record in
      select * from public.fee_templates
      where division_template_id = template_record.id
      order by sort_order, created_at
    loop
      insert into public.roping_fees (
        organization_id, roping_id, roping_division_id, source_template_id,
        title, amount_cents, scope, included_in_entry_price,
        contributes_to_payout, is_required, sort_order, kind
      ) values (
        target_organization_id, new_roping_id, new_division_id, fee_record.id,
        fee_record.title, fee_record.amount_cents, fee_record.scope,
        fee_record.included_in_entry_price, fee_record.contributes_to_payout,
        fee_record.is_required, fee_record.sort_order, fee_record.kind
      ) returning id into new_fee_id;

      if fee_record.kind = 'side_pot' and fee_record.payout_schedule_id is not null then
        perform public.copy_payout_schedule_to_event(
          target_organization_id, new_roping_id, new_division_id, new_fee_id,
          fee_record.payout_schedule_id, fee_record.title, 'side_pot'
        );
      end if;
    end loop;

    perform public.apply_short_round_settings(
      target_organization_id,
      new_division_id,
      event_short_round_enabled,
      event_short_round_brackets
    );

    if occurrence_incentive_enabled then
      if jsonb_typeof(occurrence -> 'incentiveRules') <> 'array'
        or jsonb_array_length(occurrence -> 'incentiveRules') = 0 then
        raise exception 'Each incentive class needs at least one handicap rule';
      end if;

      for incentive_rule in select * from jsonb_array_elements(occurrence -> 'incentiveRules')
      loop
        target_classification_id := (incentive_rule ->> 'classificationId')::uuid;
        target_adjustment := round((incentive_rule ->> 'adjustmentSeconds')::numeric, 3);
        if target_adjustment <= 0 or target_adjustment > 60 then
          raise exception 'Incentive adjustments must be greater than zero and no more than 60 seconds';
        end if;
        if not exists (
          select 1 from public.classifications
          where id = target_classification_id
            and organization_id = target_organization_id
            and discipline_id = template_record.discipline_id
            and is_active = true
        ) then
          raise exception 'An incentive classification is unavailable for this division';
        end if;
        insert into public.roping_incentive_rules (
          organization_id, roping_id, roping_division_id,
          classification_id, adjustment_seconds
        ) values (
          target_organization_id, new_roping_id, new_division_id,
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

revoke all on function public.create_roping_with_schedule(
  uuid, text, text, text, text, timestamp, timestamp, timestamp, timestamp,
  boolean, jsonb, boolean, jsonb, text, integer
) from public;
grant execute on function public.create_roping_with_schedule(
  uuid, text, text, text, text, timestamp, timestamp, timestamp, timestamp,
  boolean, jsonb, boolean, jsonb, text, integer
) to authenticated;

create or replace function public.save_class_schedule(
  target_roping_division_id uuid,
  target_scheduled_date date,
  target_schedule_type public.class_schedule_type,
  target_starts_at_local timestamp without time zone,
  target_schedule_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  organization_timezone text;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to update this schedule';
  end if;

  select timezone into organization_timezone
  from public.organizations
  where id = division_record.organization_id;

  if target_schedule_type in ('fixed', 'tentative')
    and target_starts_at_local is null then
    raise exception 'Set or tentative schedules require a start time';
  end if;

  if target_schedule_type = 'follows_previous' and not exists (
    select 1 from public.roping_divisions previous
    where previous.roping_id = division_record.roping_id
      and previous.scheduled_date = target_scheduled_date
      and previous.sort_order < division_record.sort_order
  ) then
    raise exception 'A follows-previous roping needs an earlier roping on the same date';
  end if;

  update public.roping_divisions
  set scheduled_date = target_scheduled_date,
      schedule_type = target_schedule_type,
      starts_at = case
        when target_schedule_type = 'follows_previous' then null
        else target_starts_at_local at time zone organization_timezone
      end,
      schedule_note = nullif(trim(target_schedule_note), '')
  where id = division_record.id;
end;
$$;

revoke all on function public.save_class_schedule(
  uuid, date, public.class_schedule_type, timestamp, text
) from public;
grant execute on function public.save_class_schedule(
  uuid, date, public.class_schedule_type, timestamp, text
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
  division.scheduled_date,
  division.schedule_type,
  division.schedule_note,
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
