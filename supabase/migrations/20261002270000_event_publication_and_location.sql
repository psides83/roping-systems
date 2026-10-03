alter table public.ropings
  add column venue_city text,
  add column venue_state text,
  add column venue_postal_code text,
  add column publication_state text not null default 'draft'
    check (publication_state in ('draft', 'published', 'unpublished'));

update public.ropings
set publication_state = case when is_public then 'published' else 'draft' end;

create function public.create_roping_with_short_round_policy(
  target_organization_id uuid,
  event_title text,
  event_slug text,
  event_venue_name text,
  event_address text,
  event_city text,
  event_state text,
  event_postal_code text,
  event_starts_at_local timestamp without time zone,
  event_ends_at_local timestamp without time zone,
  event_entries_open_at_local timestamp without time zone,
  event_entries_close_at_local timestamp without time zone,
  event_publication_state text,
  event_class_occurrences jsonb,
  event_short_round_enabled boolean,
  event_short_round_brackets jsonb,
  event_short_round_tie_policy public.short_round_tie_policy,
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
begin
  if event_publication_state not in ('draft', 'published', 'unpublished') then
    raise exception 'Choose a valid publication state';
  end if;

  new_roping_id := public.create_roping_with_short_round_policy(
    target_organization_id, event_title, event_slug, event_venue_name,
    event_address, event_starts_at_local, event_ends_at_local,
    event_entries_open_at_local, event_entries_close_at_local,
    event_publication_state = 'published', event_class_occurrences,
    event_short_round_enabled, event_short_round_brackets,
    event_short_round_tie_policy, event_fee_title, event_fee_amount_cents
  );

  update public.ropings
  set venue_city = nullif(trim(event_city), ''),
      venue_state = nullif(trim(event_state), ''),
      venue_postal_code = nullif(trim(event_postal_code), ''),
      publication_state = event_publication_state,
      is_public = event_publication_state = 'published'
  where id = new_roping_id;

  return new_roping_id;
end;
$$;

revoke all on function public.create_roping_with_short_round_policy(
  uuid, text, text, text, text, text, text, text, timestamp, timestamp,
  timestamp, timestamp, text, jsonb, boolean, jsonb,
  public.short_round_tie_policy, text, integer
) from public;
grant execute on function public.create_roping_with_short_round_policy(
  uuid, text, text, text, text, text, text, text, timestamp, timestamp,
  timestamp, timestamp, text, jsonb, boolean, jsonb,
  public.short_round_tie_policy, text, integer
) to authenticated;

create function public.update_event_details(
  target_roping_id uuid,
  event_title text,
  event_slug text,
  event_venue_name text,
  event_address text,
  event_city text,
  event_state text,
  event_postal_code text,
  event_starts_at_local timestamp without time zone,
  event_ends_at_local timestamp without time zone,
  event_entries_open_at_local timestamp without time zone,
  event_entries_close_at_local timestamp without time zone,
  event_publication_state text,
  event_fee_id uuid,
  event_fee_title text,
  event_fee_amount_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if event_publication_state not in ('draft', 'published', 'unpublished') then
    raise exception 'Choose a valid publication state';
  end if;

  perform public.update_event_details(
    target_roping_id, event_title, event_slug, event_venue_name, event_address,
    event_starts_at_local, event_ends_at_local, event_entries_open_at_local,
    event_entries_close_at_local, event_publication_state = 'published',
    event_fee_id, event_fee_title, event_fee_amount_cents
  );

  update public.ropings
  set venue_city = nullif(trim(event_city), ''),
      venue_state = nullif(trim(event_state), ''),
      venue_postal_code = nullif(trim(event_postal_code), ''),
      publication_state = event_publication_state,
      is_public = event_publication_state = 'published'
  where id = target_roping_id;
end;
$$;

revoke all on function public.update_event_details(
  uuid, text, text, text, text, text, text, text, timestamp, timestamp,
  timestamp, timestamp, text, uuid, text, integer
) from public;
grant execute on function public.update_event_details(
  uuid, text, text, text, text, text, text, text, timestamp, timestamp,
  timestamp, timestamp, text, uuid, text, integer
) to authenticated;

drop view public.public_roping_schedule;
create view public.public_roping_schedule
with (security_invoker = false)
as
select
  roping.id,
  roping.organization_id,
  organization.slug as organization_slug,
  roping.title,
  roping.slug,
  roping.venue_name,
  roping.address,
  roping.venue_city,
  roping.venue_state,
  roping.venue_postal_code,
  roping.starts_at,
  roping.entries_open_at,
  roping.entries_close_at,
  roping.status,
  roping.result_status
from public.ropings roping
join public.organizations organization on organization.id = roping.organization_id
where roping.publication_state = 'published';

revoke all on public.public_roping_schedule from public;
grant select on public.public_roping_schedule to anon, authenticated;
