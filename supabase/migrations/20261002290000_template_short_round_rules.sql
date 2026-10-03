create function public.is_valid_short_round_brackets(brackets jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  bracket jsonb;
  minimum_count integer;
  maximum_count integer;
  comeback_total integer;
  current_range int4range;
  previous_range int4range;
  seen_ranges int4range[] := '{}';
begin
  if jsonb_typeof(brackets) <> 'array' or jsonb_array_length(brackets) = 0 then
    return false;
  end if;

  for bracket in select * from jsonb_array_elements(brackets)
  loop
    minimum_count := (bracket ->> 'minimumEntries')::integer;
    maximum_count := nullif(bracket ->> 'maximumEntries', '')::integer;
    comeback_total := (bracket ->> 'comebackCount')::integer;
    if minimum_count < 1
      or (maximum_count is not null and maximum_count < minimum_count)
      or comeback_total < 1 then
      return false;
    end if;

    current_range := int4range(
      minimum_count,
      case when maximum_count is null then null else maximum_count + 1 end,
      '[)'
    );
    foreach previous_range in array seen_ranges
    loop
      if previous_range && current_range then return false; end if;
    end loop;
    seen_ranges := array_append(seen_ranges, current_range);
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

alter table public.division_templates
  add column short_round_enabled boolean not null default false,
  add column short_round_tie_policy public.short_round_tie_policy not null
    default 'advance_all',
  add column short_round_brackets jsonb not null default
    '[{"minimumEntries":1,"maximumEntries":null,"comebackCount":10}]'::jsonb,
  add constraint division_templates_short_round_brackets_valid check (
    public.is_valid_short_round_brackets(short_round_brackets)
  );

with latest_settings as (
  select distinct on (division.source_template_id)
    division.source_template_id,
    division.short_round_enabled,
    division.short_round_tie_policy,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'minimumEntries', bracket.minimum_entries,
          'maximumEntries', bracket.maximum_entries,
          'comebackCount', bracket.comeback_count
        ) order by bracket.sort_order
      )
      from public.roping_short_round_brackets bracket
      where bracket.roping_division_id = division.id
    ), '[{"minimumEntries":1,"maximumEntries":null,"comebackCount":10}]'::jsonb)
      as short_round_brackets
  from public.roping_divisions division
  join public.ropings roping on roping.id = division.roping_id
  where division.source_template_id is not null
  order by division.source_template_id, roping.created_at desc, division.created_at desc
)
update public.division_templates template
set short_round_enabled = latest.short_round_enabled,
    short_round_tie_policy = latest.short_round_tie_policy,
    short_round_brackets = latest.short_round_brackets
from latest_settings latest
where template.id = latest.source_template_id;

create function public.apply_template_short_round_settings(
  target_roping_division_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  template_record public.division_templates%rowtype;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null or division_record.source_template_id is null then
    return;
  end if;

  select * into template_record
  from public.division_templates
  where id = division_record.source_template_id
    and organization_id = division_record.organization_id;

  if template_record.id is null then return; end if;

  perform public.apply_short_round_settings(
    division_record.organization_id,
    division_record.id,
    template_record.short_round_enabled,
    template_record.short_round_brackets
  );

  update public.roping_divisions
  set short_round_tie_policy = template_record.short_round_tie_policy
  where id = division_record.id;
end;
$$;

revoke all on function public.apply_template_short_round_settings(uuid) from public;

create function public.apply_template_short_round_settings_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.apply_template_short_round_settings(new.id);
  return new;
end;
$$;

create trigger roping_divisions_apply_template_short_round
after insert on public.roping_divisions
for each row execute function public.apply_template_short_round_settings_on_insert();

create or replace function public.create_roping_with_short_round_policy(
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
  division_record record;
begin
  if event_publication_state not in ('draft', 'published', 'unpublished') then
    raise exception 'Choose a valid publication state';
  end if;

  new_roping_id := public.create_roping_with_short_round_policy(
    target_organization_id, event_title, event_slug, event_venue_name,
    event_address, event_starts_at_local, event_ends_at_local,
    event_entries_open_at_local, event_entries_close_at_local,
    event_publication_state = 'published', event_class_occurrences,
    false, '[]'::jsonb, 'advance_all'::public.short_round_tie_policy,
    event_fee_title, event_fee_amount_cents
  );

  update public.ropings
  set venue_city = nullif(trim(event_city), ''),
      venue_state = nullif(trim(event_state), ''),
      venue_postal_code = nullif(trim(event_postal_code), ''),
      publication_state = event_publication_state,
      is_public = event_publication_state = 'published'
  where id = new_roping_id;

  for division_record in
    select id from public.roping_divisions where roping_id = new_roping_id
  loop
    perform public.apply_template_short_round_settings(division_record.id);
  end loop;

  return new_roping_id;
end;
$$;

create or replace function public.duplicate_division_template(
  target_organization_id uuid,
  source_template_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_template public.division_templates%rowtype;
  duplicated_template_id uuid;
  copy_base_name text;
  copy_name text;
  copy_number integer := 1;
  next_sort_order integer;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'Manager access is required';
  end if;

  select * into source_template
  from public.division_templates
  where id = source_template_id
    and organization_id = target_organization_id;

  if not found then
    raise exception 'That roping template is not available in this producer';
  end if;

  copy_base_name := source_template.name || ' Copy';
  copy_name := copy_base_name;
  while exists (
    select 1 from public.division_templates
    where organization_id = target_organization_id and name = copy_name
  ) loop
    copy_number := copy_number + 1;
    copy_name := copy_base_name || ' ' || copy_number;
  end loop;

  select coalesce(max(sort_order), -1) + 1 into next_sort_order
  from public.division_templates
  where organization_id = target_organization_id;

  insert into public.division_templates (
    organization_id, name, description, number_of_runs,
    maximum_entries_per_person, allow_guests, eligibility_rules,
    scoring_rules, sort_order, is_active, payout_schedule_id, timer_count,
    timer_resolution, discipline_id, classification_id,
    minimum_runs_between_entries, competition_format, four_d_settings,
    second_round_ordering, later_round_ordering, handicap_rules,
    short_round_enabled, short_round_tie_policy, short_round_brackets
  ) values (
    target_organization_id, copy_name, source_template.description,
    source_template.number_of_runs, source_template.maximum_entries_per_person,
    source_template.allow_guests, source_template.eligibility_rules,
    source_template.scoring_rules, next_sort_order, source_template.is_active,
    source_template.payout_schedule_id, source_template.timer_count,
    source_template.timer_resolution, source_template.discipline_id, null,
    source_template.minimum_runs_between_entries,
    source_template.competition_format, null,
    source_template.second_round_ordering,
    source_template.later_round_ordering, source_template.handicap_rules,
    source_template.short_round_enabled,
    source_template.short_round_tie_policy,
    source_template.short_round_brackets
  ) returning id into duplicated_template_id;

  insert into public.fee_templates (
    organization_id, division_template_id, title, amount_cents, scope,
    included_in_entry_price, contributes_to_payout, is_required, sort_order,
    kind, payout_schedule_id
  )
  select target_organization_id, duplicated_template_id, title, amount_cents,
    scope, included_in_entry_price, contributes_to_payout, is_required,
    sort_order, kind, payout_schedule_id
  from public.fee_templates
  where division_template_id = source_template_id
    and organization_id = target_organization_id;

  return duplicated_template_id;
end;
$$;
