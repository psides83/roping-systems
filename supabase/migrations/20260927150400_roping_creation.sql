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
  organization_timezone text;
  division_record public.division_templates%rowtype;
  selected_count integer := 0;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to create events for this organization';
  end if;

  if coalesce(array_length(selected_division_template_ids, 1), 0) = 0 then
    raise exception 'Select at least one division';
  end if;

  select timezone into organization_timezone
  from public.organizations
  where id = target_organization_id;

  insert into public.ropings (
    organization_id,
    title,
    slug,
    venue_name,
    address,
    starts_at,
    entries_open_at,
    entries_close_at,
    status,
    is_public
  )
  values (
    target_organization_id,
    trim(event_title),
    trim(event_slug),
    nullif(trim(event_venue_name), ''),
    nullif(trim(event_address), ''),
    event_starts_at_local at time zone organization_timezone,
    case when event_entries_open_at_local is null then null else event_entries_open_at_local at time zone organization_timezone end,
    case when event_entries_close_at_local is null then null else event_entries_close_at_local at time zone organization_timezone end,
    case
      when event_entries_open_at_local is not null
        and event_entries_open_at_local at time zone organization_timezone <= now()
        and (event_entries_close_at_local is null or event_entries_close_at_local at time zone organization_timezone > now())
      then 'entries_open'::public.roping_status
      else 'scheduled'::public.roping_status
    end,
    event_is_public
  )
  returning id into new_roping_id;

  for division_record in
    select * from public.division_templates
    where organization_id = target_organization_id
      and is_active = true
      and id = any(selected_division_template_ids)
    order by sort_order, created_at
  loop
    selected_count := selected_count + 1;
    insert into public.roping_divisions (
      organization_id,
      roping_id,
      source_template_id,
      name,
      description,
      number_of_runs,
      maximum_entries_per_person,
      allow_guests,
      eligibility_rules,
      scoring_rules,
      sort_order
    )
    values (
      target_organization_id,
      new_roping_id,
      division_record.id,
      division_record.name,
      division_record.description,
      division_record.number_of_runs,
      division_record.maximum_entries_per_person,
      division_record.allow_guests,
      division_record.eligibility_rules,
      division_record.scoring_rules,
      division_record.sort_order
    )
    returning id into new_roping_division_id;

    insert into public.roping_fees (
      organization_id,
      roping_id,
      roping_division_id,
      source_template_id,
      title,
      amount_cents,
      scope,
      included_in_entry_price,
      contributes_to_payout,
      is_required,
      sort_order
    )
    select
      target_organization_id,
      new_roping_id,
      new_roping_division_id,
      fee.id,
      fee.title,
      fee.amount_cents,
      fee.scope,
      fee.included_in_entry_price,
      fee.contributes_to_payout,
      fee.is_required,
      fee.sort_order
    from public.fee_templates fee
    where fee.division_template_id = division_record.id;
  end loop;

  if selected_count <> array_length(selected_division_template_ids, 1) then
    raise exception 'One or more selected divisions are unavailable';
  end if;

  insert into public.roping_fees (
    organization_id,
    roping_id,
    roping_division_id,
    source_template_id,
    title,
    amount_cents,
    scope,
    included_in_entry_price,
    contributes_to_payout,
    is_required,
    sort_order
  )
  select
    target_organization_id,
    new_roping_id,
    null,
    fee.id,
    fee.title,
    fee.amount_cents,
    fee.scope,
    fee.included_in_entry_price,
    fee.contributes_to_payout,
    fee.is_required,
    fee.sort_order
  from public.fee_templates fee
  where fee.organization_id = target_organization_id
    and fee.division_template_id is null;

  return new_roping_id;
end;
$$;

grant execute on function public.create_roping_from_templates(uuid, text, text, text, text, timestamp, timestamp, timestamp, boolean, uuid[]) to authenticated;
