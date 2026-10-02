create type public.class_event_day_status as enum (
  'scheduled',
  'delayed',
  'holding',
  'in_progress',
  'completed'
);

alter table public.roping_divisions
  add column arena_name text,
  add column event_day_status public.class_event_day_status not null default 'scheduled',
  add column estimated_starts_at timestamptz,
  add column event_day_note text,
  add column event_day_updated_at timestamptz,
  add column event_day_updated_by uuid references auth.users(id) on delete set null;

create function public.update_class_event_day_status(
  target_roping_division_id uuid,
  new_arena_name text,
  new_event_day_status public.class_event_day_status,
  new_estimated_starts_at_local timestamp without time zone,
  new_event_day_note text
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
    raise exception 'You do not have permission to update this class';
  end if;

  select timezone into organization_timezone
  from public.organizations
  where id = division_record.organization_id;

  update public.roping_divisions
  set arena_name = nullif(trim(new_arena_name), ''),
      event_day_status = new_event_day_status,
      estimated_starts_at = case
        when new_estimated_starts_at_local is null then null
        else new_estimated_starts_at_local at time zone organization_timezone
      end,
      event_day_note = nullif(trim(new_event_day_note), ''),
      event_day_updated_at = now(),
      event_day_updated_by = auth.uid()
  where id = target_roping_division_id;
end;
$$;

revoke all on function public.update_class_event_day_status(
  uuid, text, public.class_event_day_status, timestamp, text
) from public;
grant execute on function public.update_class_event_day_status(
  uuid, text, public.class_event_day_status, timestamp, text
) to authenticated;

create function public.create_roping_with_event_operations(
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
  occurrence jsonb;
  occurrence_position integer := 0;
begin
  new_roping_id := public.create_roping_with_competition_formats(
    target_organization_id,
    event_title,
    event_slug,
    event_venue_name,
    event_address,
    event_starts_at_local,
    event_ends_at_local,
    event_entries_open_at_local,
    event_entries_close_at_local,
    event_is_public,
    event_class_occurrences,
    event_short_round_enabled,
    event_short_round_brackets,
    event_fee_title,
    event_fee_amount_cents
  );

  for occurrence in select * from jsonb_array_elements(event_class_occurrences)
  loop
    occurrence_position := occurrence_position + 1;
    update public.roping_divisions
    set arena_name = nullif(trim(occurrence ->> 'arenaName'), '')
    where roping_id = new_roping_id
      and sort_order = occurrence_position;
  end loop;

  return new_roping_id;
end;
$$;

revoke all on function public.create_roping_with_event_operations(
  uuid, text, text, text, text, timestamp, timestamp, timestamp, timestamp,
  boolean, jsonb, boolean, jsonb, text, integer
) from public;
grant execute on function public.create_roping_with_event_operations(
  uuid, text, text, text, text, timestamp, timestamp, timestamp, timestamp,
  boolean, jsonb, boolean, jsonb, text, integer
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
  division.arena_name,
  division.event_day_status,
  division.estimated_starts_at,
  division.event_day_note,
  division.event_day_updated_at,
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
