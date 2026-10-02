alter table public.roping_incentive_rules
  drop constraint if exists roping_incentive_rules_adjustment_seconds_check,
  add constraint roping_incentive_rules_adjustment_seconds_check
    check (adjustment_seconds between 0 and 60);

create or replace function public.enforce_entry_classification_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  discipline_record public.disciplines%rowtype;
  target_classification record;
  member_classification record;
  contestant_record public.people%rowtype;
  contestant_age integer;
  male_exception_applies boolean := false;
  eligibility_failure text;
  override_requested boolean := coalesce(new.eligibility_overridden, false);
  override_reason text := nullif(trim(new.eligibility_override_reason), '');
  transfer_override_reason text := nullif(
    trim(current_setting('app.eligibility_override_reason', true)),
    ''
  );
begin
  select * into division_record
  from public.roping_divisions
  where id = new.roping_division_id;

  select * into discipline_record
  from public.disciplines
  where id = division_record.discipline_id;

  select
    classification.id,
    classification.name,
    classification.discipline_id,
    classification.rank,
    classification.eligibility_type,
    classification.minimum_age,
    classification.maximum_age
  into target_classification
  from public.classifications classification
  where classification.id = division_record.classification_id;

  if tg_op = 'UPDATE'
    and new.roping_division_id is distinct from old.roping_division_id
    and new.eligibility_override_reason
      is not distinct from old.eligibility_override_reason then
    override_requested := false;
    override_reason := null;
  end if;

  if transfer_override_reason is not null then
    override_requested := true;
    override_reason := transfer_override_reason;
  end if;

  new.is_eligible := true;
  new.eligibility_note := null;
  new.eligibility_overridden := false;
  new.eligibility_override_reason := null;
  new.eligibility_overridden_by := null;
  new.eligibility_overridden_at := null;

  select * into contestant_record
  from public.people
  where id = new.person_id;

  if new.membership_id is null and not division_record.allow_guests then
    eligibility_failure := 'An active membership is required for this roping';
  elsif discipline_record.gender_policy = 'women_only' then
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
  end if;

  if eligibility_failure is null
    and division_record.competition_format = 'handicap' then
    if new.membership_id is null then
      eligibility_failure :=
        'A current member classification is required for this handicap roping';
    elsif new.incentive_classification_id is null then
      eligibility_failure :=
        'The member needs a current classification included in this handicap setup';
    end if;
  elsif eligibility_failure is null then
    if target_classification.id is null
      or target_classification.eligibility_type = 'open' then
      eligibility_failure := null;
    elsif target_classification.eligibility_type = 'age' then
      if contestant_record.birth_date is null then
        eligibility_failure := format(
          'A birth date is required for the %s class',
          target_classification.name
        );
      else
        contestant_age := extract(
          year from age(
            division_record.scheduled_date,
            contestant_record.birth_date
          )
        )::integer;

        if target_classification.minimum_age is not null
          and contestant_age < target_classification.minimum_age then
          eligibility_failure := format(
            'Contestant does not meet the minimum age for the %s class',
            target_classification.name
          );
        elsif target_classification.maximum_age is not null
          and contestant_age > target_classification.maximum_age then
          eligibility_failure := format(
            'Contestant exceeds the maximum age for the %s class',
            target_classification.name
          );
        end if;
      end if;
    elsif new.membership_id is null then
      new.eligibility_note := 'Guest skill eligibility accepted by event staff';
    else
      select classification.name, classification.rank
        into member_classification
      from public.member_classifications assignment
      join public.classifications classification
        on classification.id = assignment.classification_id
      where assignment.membership_id = new.membership_id
        and assignment.discipline_id = target_classification.discipline_id
        and assignment.effective_on <= division_record.scheduled_date
        and (
          assignment.ended_on is null
          or assignment.ended_on >= division_record.scheduled_date
        )
        and classification.eligibility_type = 'skill'
      order by assignment.effective_on desc, assignment.created_at desc
      limit 1;

      if member_classification.rank is null then
        eligibility_failure := format(
          'Contestant needs an active skill classification for the %s division',
          target_classification.name
        );
      elsif member_classification.rank < target_classification.rank then
        eligibility_failure := format(
          'A %s contestant cannot enter the %s class',
          member_classification.name,
          target_classification.name
        );
      end if;
    end if;
  end if;

  if eligibility_failure is not null then
    if not override_requested then
      raise exception '%', eligibility_failure;
    end if;
    if not public.can_manage_organization(new.organization_id) then
      raise exception 'Manager access is required to override eligibility';
    end if;
    if length(coalesce(override_reason, '')) < 5 then
      raise exception 'Enter a brief reason for the eligibility override';
    end if;

    new.is_eligible := true;
    new.eligibility_note := eligibility_failure;
    new.eligibility_overridden := true;
    new.eligibility_override_reason := override_reason;
    new.eligibility_overridden_by := auth.uid();
    new.eligibility_overridden_at := now();
  end if;

  return new;
end;
$$;

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
  selected_template public.division_templates%rowtype;
  occurrence_format public.competition_format;
  target_classification_id uuid;
  placeholder_classification_id uuid;
  target_adjustment numeric(8, 3);
begin
  if jsonb_typeof(event_class_occurrences) <> 'array' then
    raise exception 'Add at least one scheduled roping';
  end if;

  for occurrence in select * from jsonb_array_elements(event_class_occurrences)
  loop
    select * into selected_template
    from public.division_templates
    where id = (occurrence ->> 'templateId')::uuid
      and organization_id = target_organization_id
      and is_active = true;

    if selected_template.id is null then
      raise exception 'A selected roping template is unavailable';
    end if;

    transformed_occurrence := occurrence;
    transformed_rules := '[]'::jsonb;

    if selected_template.competition_format = 'handicap' then
      transformed_occurrence := jsonb_set(
        transformed_occurrence,
        '{incentiveEnabled}',
        'true'::jsonb
      );
      if jsonb_typeof(occurrence -> 'incentiveRules') <> 'array'
        or jsonb_array_length(occurrence -> 'incentiveRules') = 0 then
        raise exception 'Add handicap deductions for the member classifications';
      end if;
      placeholder_classification_id :=
        ((occurrence -> 'incentiveRules' -> 0) ->> 'classificationId')::uuid;
      transformed_occurrence := jsonb_set(
        transformed_occurrence,
        '{classificationId}',
        to_jsonb(placeholder_classification_id::text)
      );
    end if;

    if coalesce(
      (transformed_occurrence ->> 'incentiveEnabled')::boolean,
      false
    ) then
      for incentive_rule in
        select * from jsonb_array_elements(occurrence -> 'incentiveRules')
      loop
        target_adjustment := round(
          (incentive_rule ->> 'adjustmentSeconds')::numeric,
          3
        );
        if target_adjustment < 0 or target_adjustment > 60 then
          raise exception 'Handicap deductions must be between 0 and 60 seconds';
        end if;
        transformed_rules := transformed_rules || jsonb_build_array(
          jsonb_set(
            incentive_rule,
            '{adjustmentSeconds}',
            to_jsonb(case when target_adjustment = 0 then 0.001 else target_adjustment end)
          )
        );
      end loop;
      transformed_occurrence := jsonb_set(
        transformed_occurrence,
        '{incentiveRules}',
        transformed_rules
      );
    end if;

    transformed_occurrences :=
      transformed_occurrences || jsonb_build_array(transformed_occurrence);
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
    select division.id, template.competition_format
      into new_division_id, occurrence_format
    from public.roping_divisions division
    join public.division_templates template
      on template.id = division.source_template_id
    where division.roping_id = new_roping_id
      and division.sort_order = occurrence_position;

    update public.roping_divisions
    set cattle_draw_enabled = coalesce(
          (occurrence ->> 'cattleDrawEnabled')::boolean,
          false
        ),
        classification_id = case
          when occurrence_format = 'handicap' then null
          else classification_id
        end,
        name = case
          when occurrence_format = 'handicap' then 'Handicap'
          else name
        end,
        incentive_enabled = case
          when occurrence_format = 'handicap' then true
          else incentive_enabled
        end
    where id = new_division_id;

    if coalesce((occurrence ->> 'incentiveEnabled')::boolean, false)
      or occurrence_format = 'handicap' then
      for incentive_rule in
        select * from jsonb_array_elements(occurrence -> 'incentiveRules')
      loop
        target_classification_id :=
          (incentive_rule ->> 'classificationId')::uuid;
        target_adjustment := round(
          (incentive_rule ->> 'adjustmentSeconds')::numeric,
          3
        );
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
