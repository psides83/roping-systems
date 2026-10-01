create type public.competition_format as enum ('standard', 'handicap', 'four_d');

create or replace function public.is_valid_four_d_settings(settings jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  bracket jsonb;
  purse_total integer;
begin
  if settings is null
    or jsonb_typeof(settings) <> 'object'
    or jsonb_typeof(settings -> 'brackets') <> 'array'
    or jsonb_array_length(settings -> 'brackets') = 0
    or coalesce((settings ->> 'splitSeconds')::numeric, 0) <= 0 then
    return false;
  end if;

  for bracket in select * from jsonb_array_elements(settings -> 'brackets')
  loop
    if coalesce((bracket ->> 'minimumEntries')::integer, 0) < 1
      or coalesce((bracket ->> 'activeDivisions')::integer, 0) not between 1 and 4
      or (
        nullif(bracket ->> 'maximumEntries', '') is not null
        and (bracket ->> 'maximumEntries')::integer < (bracket ->> 'minimumEntries')::integer
      )
      or jsonb_typeof(bracket -> 'purseBasisPoints') <> 'array'
      or jsonb_array_length(bracket -> 'purseBasisPoints') <> 4
      or jsonb_typeof(bracket -> 'placesByDivision') <> 'array'
      or jsonb_array_length(bracket -> 'placesByDivision') <> 4 then
      return false;
    end if;

    select coalesce(sum(value::integer), 0) into purse_total
    from jsonb_array_elements_text(bracket -> 'purseBasisPoints')
    with ordinality purse(value, position)
    where position <= (bracket ->> 'activeDivisions')::integer;

    if purse_total <> 10000
      or exists (
        select 1
        from jsonb_array_elements_text(bracket -> 'placesByDivision')
        with ordinality places(value, position)
        where (
          position <= (bracket ->> 'activeDivisions')::integer
          and value::integer < 1
        ) or (
          position > (bracket ->> 'activeDivisions')::integer
          and value::integer <> 0
        )
      )
      or exists (
        select 1
        from jsonb_array_elements_text(bracket -> 'purseBasisPoints')
        with ordinality purse(value, position)
        where value::integer < 0
          or (position > (bracket ->> 'activeDivisions')::integer and value::integer <> 0)
      ) then
      return false;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(settings -> 'brackets') with ordinality first_bracket(value, position)
    join jsonb_array_elements(settings -> 'brackets') with ordinality second_bracket(value, position)
      on first_bracket.position < second_bracket.position
     and int4range(
       (first_bracket.value ->> 'minimumEntries')::integer,
       coalesce(nullif(first_bracket.value ->> 'maximumEntries', '')::integer + 1, 2147483647),
       '[)'
     ) && int4range(
       (second_bracket.value ->> 'minimumEntries')::integer,
       coalesce(nullif(second_bracket.value ->> 'maximumEntries', '')::integer + 1, 2147483647),
       '[)'
     )
  ) then
    return false;
  end if;

  return true;
exception when others then
  return false;
end;
$$;

alter table public.division_templates
  add column competition_format public.competition_format not null default 'standard',
  add column four_d_settings jsonb,
  add constraint division_templates_four_d_settings_valid check (
    (competition_format = 'four_d' and public.is_valid_four_d_settings(four_d_settings))
    or (competition_format <> 'four_d' and four_d_settings is null)
  );

alter table public.roping_divisions
  add column competition_format public.competition_format not null default 'standard',
  add column four_d_settings jsonb,
  add constraint roping_divisions_four_d_settings_valid check (
    (competition_format = 'four_d' and public.is_valid_four_d_settings(four_d_settings))
    or (competition_format <> 'four_d' and four_d_settings is null)
  );

update public.roping_divisions
set competition_format = 'handicap'
where incentive_enabled = true;

alter table public.entries
  drop constraint if exists entries_incentive_adjustment_seconds_check,
  add constraint entries_incentive_adjustment_seconds_check
    check (incentive_adjustment_seconds between -60 and 60);

alter table public.roping_incentive_rules
  drop constraint if exists roping_incentive_rules_adjustment_seconds_check,
  add constraint roping_incentive_rules_adjustment_seconds_check
    check (adjustment_seconds between -60 and 60 and adjustment_seconds <> 0);

create or replace function public.copy_template_competition_format()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_template_id is not null then
    select template.competition_format, template.four_d_settings
      into new.competition_format, new.four_d_settings
    from public.division_templates template
    where template.id = new.source_template_id
      and template.organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

create trigger roping_divisions_copy_competition_format
before insert on public.roping_divisions
for each row execute function public.copy_template_competition_format();

create or replace function public.calculate_four_d_results(target_roping_division_id uuid)
returns table (
  d_number integer,
  d_label text,
  d_start_seconds numeric,
  d_end_seconds numeric,
  place_number integer,
  entry_id uuid,
  contestant_name text,
  entry_number integer,
  final_time_seconds numeric,
  result_status public.result_status,
  active_divisions integer,
  places_paid integer,
  purse_basis_points integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  roping_is_public boolean;
  entry_count integer;
  split_seconds numeric;
  selected_bracket jsonb;
begin
  select division.*
    into division_record
  from public.roping_divisions division
  where division.id = target_roping_division_id;

  select roping.is_public into roping_is_public
  from public.ropings roping
  where roping.id = division_record.roping_id;

  if division_record.id is null
    or division_record.competition_format <> 'four_d' then
    raise exception 'Choose a valid 4D roping';
  end if;
  if not roping_is_public
    and not public.has_organization_access(division_record.organization_id) then
    raise exception 'You do not have permission to view these results';
  end if;

  select count(*)::integer into entry_count
  from public.entries
  where roping_division_id = target_roping_division_id;

  select bracket.value into selected_bracket
  from jsonb_array_elements(division_record.four_d_settings -> 'brackets') bracket(value)
  where entry_count >= (bracket.value ->> 'minimumEntries')::integer
    and (
      nullif(bracket.value ->> 'maximumEntries', '') is null
      or entry_count <= (bracket.value ->> 'maximumEntries')::integer
    )
  order by (bracket.value ->> 'minimumEntries')::integer desc
  limit 1;

  if selected_bracket is null then return; end if;
  split_seconds := (division_record.four_d_settings ->> 'splitSeconds')::numeric;

  return query
  with completed as (
    select entry.id, entry.entry_number,
      trim(person.first_name || ' ' || person.last_name) as contestant_name,
      greatest(
        run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds,
        0
      ) as final_time
    from public.entries entry
    join public.people person on person.id = entry.person_id
    join public.runs run on run.entry_id = entry.id and run.run_number = 1
    where entry.roping_division_id = target_roping_division_id
      and run.status = 'complete'
      and run.raw_time_seconds is not null
  ), fastest as (
    select min(final_time) as fastest_time from completed
  ), assigned as (
    select completed.*,
      least(
        (selected_bracket ->> 'activeDivisions')::integer,
        floor((completed.final_time - fastest.fastest_time) / split_seconds)::integer + 1
      ) as assigned_d,
      fastest.fastest_time
    from completed cross join fastest
  ), ranked as (
    select assigned.*,
      rank() over (partition by assigned_d order by final_time)::integer as assigned_place
    from assigned
  )
  select
    ranked.assigned_d,
    ranked.assigned_d::text || 'D',
    ranked.fastest_time + ((ranked.assigned_d - 1) * split_seconds),
    case
      when ranked.assigned_d = (selected_bracket ->> 'activeDivisions')::integer then null
      else ranked.fastest_time + (ranked.assigned_d * split_seconds)
    end,
    ranked.assigned_place,
    ranked.id,
    ranked.contestant_name,
    ranked.entry_number,
    ranked.final_time,
    division_record.result_status,
    (selected_bracket ->> 'activeDivisions')::integer,
    (selected_bracket -> 'placesByDivision' ->> (ranked.assigned_d - 1))::integer,
    (selected_bracket -> 'purseBasisPoints' ->> (ranked.assigned_d - 1))::integer
  from ranked
  order by ranked.assigned_d, ranked.final_time, ranked.id;
end;
$$;

grant execute on function public.calculate_four_d_results(uuid) to anon, authenticated;

create view public.public_competition_formats
with (security_invoker = false)
as
select
  roping.id as roping_id,
  roping.slug as roping_slug,
  organization.slug as organization_slug,
  division.id as division_id,
  division.name as division_name,
  division.competition_format
from public.roping_divisions division
join public.ropings roping on roping.id = division.roping_id
join public.organizations organization on organization.id = division.organization_id
where roping.is_public = true;

revoke all on public.public_competition_formats from public;
grant select on public.public_competition_formats to anon, authenticated;

create or replace function public.create_roping_with_competition_formats(
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
  occurrence jsonb;
  incentive_rule jsonb;
  transformed_occurrences jsonb := '[]'::jsonb;
  transformed_occurrence jsonb;
  transformed_rules jsonb;
  new_roping_id uuid;
  new_division_id uuid;
  occurrence_position integer := 0;
  target_classification_id uuid;
  target_adjustment numeric(8, 3);
begin
  if jsonb_typeof(event_class_occurrences) <> 'array' then
    raise exception 'Add at least one scheduled class roping';
  end if;

  for occurrence in select * from jsonb_array_elements(event_class_occurrences)
  loop
    transformed_occurrence := occurrence;
    transformed_rules := '[]'::jsonb;

    if coalesce((occurrence ->> 'incentiveEnabled')::boolean, false) then
      for incentive_rule in select * from jsonb_array_elements(occurrence -> 'incentiveRules')
      loop
        target_adjustment := round((incentive_rule ->> 'adjustmentSeconds')::numeric, 3);
        if target_adjustment = 0 or abs(target_adjustment) > 60 then
          raise exception 'Handicap adjustments must be non-zero and no more than 60 seconds';
        end if;
        transformed_rules := transformed_rules || jsonb_build_array(
          jsonb_set(incentive_rule, '{adjustmentSeconds}', to_jsonb(abs(target_adjustment)))
        );
      end loop;
      transformed_occurrence := jsonb_set(transformed_occurrence, '{incentiveRules}', transformed_rules);
    end if;

    transformed_occurrences := transformed_occurrences || jsonb_build_array(transformed_occurrence);
  end loop;

  new_roping_id := public.create_roping_with_schedule(
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
    transformed_occurrences,
    event_short_round_enabled,
    event_short_round_brackets,
    event_fee_title,
    event_fee_amount_cents
  );

  for occurrence in select * from jsonb_array_elements(event_class_occurrences)
  loop
    occurrence_position := occurrence_position + 1;
    if coalesce((occurrence ->> 'incentiveEnabled')::boolean, false) then
      select id into new_division_id
      from public.roping_divisions
      where roping_id = new_roping_id and sort_order = occurrence_position;

      for incentive_rule in select * from jsonb_array_elements(occurrence -> 'incentiveRules')
      loop
        target_classification_id := (incentive_rule ->> 'classificationId')::uuid;
        target_adjustment := round((incentive_rule ->> 'adjustmentSeconds')::numeric, 3);
        update public.roping_incentive_rules
        set adjustment_seconds = target_adjustment
        where roping_division_id = new_division_id
          and classification_id = target_classification_id;
      end loop;
    end if;
  end loop;

  return new_roping_id;
end;
$$;

revoke all on function public.create_roping_with_competition_formats(
  uuid, text, text, text, text, timestamp, timestamp, timestamp, timestamp,
  boolean, jsonb, boolean, jsonb, text, integer
) from public;
grant execute on function public.create_roping_with_competition_formats(
  uuid, text, text, text, text, timestamp, timestamp, timestamp, timestamp,
  boolean, jsonb, boolean, jsonb, text, integer
) to authenticated;
