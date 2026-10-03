create function public.update_event_details(
  target_roping_id uuid,
  event_title text,
  event_slug text,
  event_venue_name text,
  event_address text,
  event_starts_at_local timestamp without time zone,
  event_ends_at_local timestamp without time zone,
  event_entries_open_at_local timestamp without time zone,
  event_entries_close_at_local timestamp without time zone,
  event_is_public boolean,
  event_fee_id uuid,
  event_fee_title text,
  event_fee_amount_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.ropings%rowtype;
  organization_timezone text;
  old_start_local timestamp without time zone;
  day_shift integer;
  target_end_date date;
  saved_fee_id uuid;
begin
  select * into event_record
  from public.ropings
  where id = target_roping_id
  for update;

  if event_record.id is null
    or not public.can_manage_organization(event_record.organization_id) then
    raise exception 'You do not have permission to edit this event';
  end if;
  if event_record.status in ('in_progress', 'completed', 'cancelled') then
    raise exception 'Event setup cannot change after the event has started';
  end if;
  if length(trim(coalesce(event_title, ''))) < 2 then
    raise exception 'Event title is required';
  end if;
  if trim(coalesce(event_slug, '')) !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'Use lowercase letters, numbers, and hyphens for the public URL';
  end if;
  if event_ends_at_local is not null
    and event_ends_at_local < event_starts_at_local then
    raise exception 'The event end must be after its start';
  end if;
  if event_entries_open_at_local is not null
    and event_entries_close_at_local is not null
    and event_entries_close_at_local < event_entries_open_at_local then
    raise exception 'Entries must close after they open';
  end if;
  if (nullif(trim(coalesce(event_fee_title, '')), '') is null)
    <> (event_fee_amount_cents is null) then
    raise exception 'Enter both an event charge name and amount, or leave both blank';
  end if;
  if event_fee_amount_cents is not null and event_fee_amount_cents < 0 then
    raise exception 'Enter a valid event charge amount';
  end if;

  select timezone into organization_timezone
  from public.organizations
  where id = event_record.organization_id;
  if organization_timezone is null then
    raise exception 'Producer timezone is unavailable';
  end if;

  old_start_local := event_record.starts_at at time zone organization_timezone;
  day_shift := event_starts_at_local::date - old_start_local::date;
  target_end_date := coalesce(event_ends_at_local, event_starts_at_local)::date;

  if exists (
    select 1
    from public.roping_divisions division
    where division.roping_id = event_record.id
      and (
        division.scheduled_date + day_shift < event_starts_at_local::date
        or division.scheduled_date + day_shift > target_end_date
      )
  ) then
    raise exception 'The event date range must include every scheduled roping';
  end if;

  if day_shift <> 0 then
    update public.roping_divisions
    set scheduled_date = scheduled_date + day_shift,
        starts_at = case
          when starts_at is null then null
          else starts_at + (day_shift * interval '1 day')
        end
    where roping_id = event_record.id;
  end if;

  update public.ropings
  set title = trim(event_title),
      slug = trim(event_slug),
      venue_name = nullif(trim(event_venue_name), ''),
      address = nullif(trim(event_address), ''),
      starts_at = event_starts_at_local at time zone organization_timezone,
      ends_at = case
        when event_ends_at_local is null then null
        else event_ends_at_local at time zone organization_timezone
      end,
      entries_open_at = case
        when event_entries_open_at_local is null then null
        else event_entries_open_at_local at time zone organization_timezone
      end,
      entries_close_at = case
        when event_entries_close_at_local is null then null
        else event_entries_close_at_local at time zone organization_timezone
      end,
      status = case
        when event_entries_open_at_local is not null
          and event_entries_open_at_local at time zone organization_timezone <= now()
          and (
            event_entries_close_at_local is null
            or event_entries_close_at_local at time zone organization_timezone > now()
          ) then 'entries_open'::public.roping_status
        when event_entries_close_at_local is not null
          and event_entries_close_at_local at time zone organization_timezone <= now()
          then 'entries_closed'::public.roping_status
        else 'scheduled'::public.roping_status
      end,
      is_public = event_is_public
  where id = event_record.id;

  if event_fee_id is not null and not exists (
    select 1 from public.roping_fees
    where id = event_fee_id
      and roping_id = event_record.id
      and roping_division_id is null
  ) then
    raise exception 'That event charge is unavailable';
  end if;

  if nullif(trim(coalesce(event_fee_title, '')), '') is null then
    if event_fee_id is not null then
      delete from public.entry_charges where roping_fee_id = event_fee_id;
      delete from public.roping_fees where id = event_fee_id;
    end if;
  elsif event_fee_id is not null then
    update public.roping_fees
    set title = trim(event_fee_title),
        amount_cents = event_fee_amount_cents
    where id = event_fee_id;
    update public.entry_charges
    set title = trim(event_fee_title),
        amount_cents = event_fee_amount_cents
    where roping_fee_id = event_fee_id;
  else
    insert into public.roping_fees (
      organization_id, roping_id, roping_division_id, title, amount_cents,
      scope, included_in_entry_price, contributes_to_payout, is_required,
      sort_order, kind
    ) values (
      event_record.organization_id, event_record.id, null,
      trim(event_fee_title), event_fee_amount_cents, 'contestant_event',
      false, false, true, 0, 'standard'
    ) returning id into saved_fee_id;

    insert into public.entry_charges (
      organization_id, roping_id, person_id, entry_id, roping_fee_id,
      title, amount_cents
    )
    select distinct
      event_record.organization_id, event_record.id, entry.person_id, null,
      saved_fee_id, trim(event_fee_title), event_fee_amount_cents
    from public.entries entry
    where entry.roping_id = event_record.id
      and entry.competition_status = 'active';
  end if;
end;
$$;

revoke all on function public.update_event_details(
  uuid, text, text, text, text, timestamp, timestamp, timestamp, timestamp,
  boolean, uuid, text, integer
) from public;
grant execute on function public.update_event_details(
  uuid, text, text, text, text, timestamp, timestamp, timestamp, timestamp,
  boolean, uuid, text, integer
) to authenticated;
