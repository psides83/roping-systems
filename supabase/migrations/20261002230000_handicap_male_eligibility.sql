create type public.male_eligibility_policy as enum (
  'producer_default',
  'none',
  'age',
  'classification',
  'age_and_classification',
  'age_or_classification'
);

alter table public.roping_divisions
  add column male_eligibility_policy public.male_eligibility_policy not null default 'producer_default',
  add column male_youth_maximum_age integer check (male_youth_maximum_age between 0 and 120),
  add column male_senior_minimum_age integer check (male_senior_minimum_age between 0 and 120),
  add column male_classification_discipline_id uuid references public.disciplines(id) on delete restrict,
  add column male_minimum_classification_number numeric(6, 2) check (male_minimum_classification_number >= 0),
  add constraint roping_male_eligibility_settings_valid check (
    male_eligibility_policy in ('producer_default', 'none')
    or (
      male_eligibility_policy in ('age', 'age_and_classification', 'age_or_classification')
      and (male_youth_maximum_age is not null or male_senior_minimum_age is not null)
      and (male_youth_maximum_age is null or male_senior_minimum_age is null or male_youth_maximum_age < male_senior_minimum_age)
    )
    or male_eligibility_policy = 'classification'
  ),
  add constraint roping_male_classification_settings_valid check (
    male_eligibility_policy not in ('classification', 'age_and_classification', 'age_or_classification')
    or (male_classification_discipline_id is not null and male_minimum_classification_number is not null)
  );

create function public.event_male_exception_applies(
  target_division_id uuid,
  target_person_id uuid,
  target_membership_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  person_record public.people%rowtype;
  contestant_age integer;
  age_matches boolean := false;
  classification_matches boolean := false;
begin
  select * into division_record from public.roping_divisions where id = target_division_id;
  select * into person_record from public.people where id = target_person_id;

  if division_record.male_eligibility_policy = 'none' then return false; end if;

  if division_record.male_eligibility_policy in ('age', 'age_and_classification', 'age_or_classification')
    and person_record.birth_date is not null then
    contestant_age := extract(year from age(division_record.scheduled_date, person_record.birth_date))::integer;
    age_matches := (
      division_record.male_youth_maximum_age is not null
      and contestant_age <= division_record.male_youth_maximum_age
    ) or (
      division_record.male_senior_minimum_age is not null
      and contestant_age >= division_record.male_senior_minimum_age
    );
  end if;

  if division_record.male_eligibility_policy in ('classification', 'age_and_classification', 'age_or_classification')
    and target_membership_id is not null then
    select exists (
      select 1
      from public.member_classifications assignment
      join public.classifications classification on classification.id = assignment.classification_id
      where assignment.membership_id = target_membership_id
        and assignment.discipline_id = division_record.male_classification_discipline_id
        and assignment.effective_on <= division_record.scheduled_date
        and (assignment.ended_on is null or assignment.ended_on >= division_record.scheduled_date)
        and classification.eligibility_type = 'skill'
        and classification.rank >= division_record.male_minimum_classification_number
    ) into classification_matches;
  end if;

  return case division_record.male_eligibility_policy
    when 'age' then age_matches
    when 'classification' then classification_matches
    when 'age_and_classification' then age_matches and classification_matches
    when 'age_or_classification' then age_matches or classification_matches
    else false
  end;
end;
$$;

do $migration$
declare
  definition text;
  old_block text := $old$elsif discipline_record.gender_policy = 'women_only' then
    if contestant_record.competition_gender is null then
      eligibility_failure :=
        'Competition gender is required for this breakaway division';
    elsif contestant_record.competition_gender = 'male' then
      if discipline_record.male_youth_maximum_age is null
        and discipline_record.male_senior_minimum_age is null then
        eligibility_failure :=
          'This breakaway division is limited to female contestants';
      elsif contestant_record.birth_date is null then
        eligibility_failure :=
          'A birth date is required to verify the male breakaway exception';
      else
        contestant_age := extract(
          year from age(
            division_record.scheduled_date,
            contestant_record.birth_date
          )
        )::integer;
        male_exception_applies := (
          discipline_record.male_youth_maximum_age is not null
          and contestant_age <= discipline_record.male_youth_maximum_age
        ) or (
          discipline_record.male_senior_minimum_age is not null
          and contestant_age >= discipline_record.male_senior_minimum_age
        );
        if not male_exception_applies then
          eligibility_failure :=
            'Contestant does not meet this producer''s male breakaway age exception';
        end if;
      end if;
    end if;
  end if;$old$;
  new_block text := $new$elsif discipline_record.gender_policy = 'women_only' then
    if contestant_record.competition_gender is null then
      eligibility_failure := 'Competition gender is required for this breakaway division';
    elsif contestant_record.competition_gender = 'male' then
      if division_record.male_eligibility_policy <> 'producer_default' then
        male_exception_applies := public.event_male_exception_applies(
          division_record.id, contestant_record.id, new.membership_id
        );
        if not male_exception_applies then
          eligibility_failure := 'Contestant does not meet this roping''s male breakaway exception';
        end if;
      elsif discipline_record.male_youth_maximum_age is null
        and discipline_record.male_senior_minimum_age is null then
        eligibility_failure := 'This breakaway division is limited to female contestants';
      elsif contestant_record.birth_date is null then
        eligibility_failure := 'A birth date is required to verify the male breakaway exception';
      else
        contestant_age := extract(year from age(division_record.scheduled_date, contestant_record.birth_date))::integer;
        male_exception_applies := (
          discipline_record.male_youth_maximum_age is not null
          and contestant_age <= discipline_record.male_youth_maximum_age
        ) or (
          discipline_record.male_senior_minimum_age is not null
          and contestant_age >= discipline_record.male_senior_minimum_age
        );
        if not male_exception_applies then
          eligibility_failure := 'Contestant does not meet this producer''s male breakaway age exception';
        end if;
      end if;
    end if;
  end if;$new$;
begin
  select pg_get_functiondef('public.enforce_entry_classification_eligibility()'::regprocedure) into definition;
  if position(old_block in definition) = 0 then
    raise exception 'Unable to update the current entry eligibility function';
  end if;
  execute replace(definition, old_block, new_block);
end;
$migration$;

create or replace function public.create_roping_with_short_round_policy(
  target_organization_id uuid, event_title text, event_slug text,
  event_venue_name text, event_address text,
  event_starts_at_local timestamp, event_ends_at_local timestamp,
  event_entries_open_at_local timestamp, event_entries_close_at_local timestamp,
  event_is_public boolean, event_class_occurrences jsonb,
  event_short_round_enabled boolean, event_short_round_brackets jsonb,
  event_short_round_tie_policy public.short_round_tie_policy,
  event_fee_title text, event_fee_amount_cents integer
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
  new_roping_id := public.create_roping_with_event_operations(
    target_organization_id, event_title, event_slug, event_venue_name,
    event_address, event_starts_at_local, event_ends_at_local,
    event_entries_open_at_local, event_entries_close_at_local, event_is_public,
    event_class_occurrences, event_short_round_enabled,
    event_short_round_brackets, event_fee_title, event_fee_amount_cents
  );

  update public.roping_divisions
  set short_round_tie_policy = event_short_round_tie_policy
  where roping_id = new_roping_id and short_round_enabled = true;

  for occurrence in select * from jsonb_array_elements(event_class_occurrences) loop
    occurrence_position := occurrence_position + 1;
    update public.roping_divisions
    set male_eligibility_policy = coalesce((occurrence ->> 'maleEligibilityPolicy')::public.male_eligibility_policy, 'producer_default'),
        male_youth_maximum_age = (occurrence ->> 'maleYouthMaximumAge')::integer,
        male_senior_minimum_age = (occurrence ->> 'maleSeniorMinimumAge')::integer,
        male_classification_discipline_id = (occurrence ->> 'maleClassificationDisciplineId')::uuid,
        male_minimum_classification_number = (occurrence ->> 'maleMinimumClassificationNumber')::numeric
    where roping_id = new_roping_id and sort_order = occurrence_position;
  end loop;
  return new_roping_id;
end;
$$;
