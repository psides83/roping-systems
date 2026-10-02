alter table public.payout_schedules
  add column short_round_enabled boolean not null default false,
  add column competition_format public.competition_format not null default 'standard',
  add column four_d_settings jsonb;

update public.payout_schedules
set short_round_enabled = short_round_basis_points > 0;

update public.payout_schedules schedule
set competition_format = 'four_d',
    four_d_settings = source.four_d_settings
from (
  select distinct on (template.payout_schedule_id)
    template.payout_schedule_id,
    template.four_d_settings
  from public.division_templates template
  where template.competition_format = 'four_d'
    and template.payout_schedule_id is not null
    and public.is_valid_four_d_settings(template.four_d_settings)
  order by template.payout_schedule_id, template.created_at
) source
where schedule.id = source.payout_schedule_id;

alter table public.payout_schedules
  add constraint payout_schedules_four_d_settings_valid check (
    (
      competition_format = 'four_d'
      and public.is_valid_four_d_settings(four_d_settings)
    )
    or (
      competition_format = 'standard'
      and four_d_settings is null
    )
  ),
  add constraint payout_schedules_short_round_allocation_valid check (
    (short_round_enabled = true)
    or short_round_basis_points = 0
  );

alter table public.division_templates
  drop constraint division_templates_four_d_settings_valid;

create or replace function public.apply_division_classification_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  template_discipline_id uuid;
begin
  if new.source_template_id is not null then
    select discipline_id into template_discipline_id
    from public.division_templates
    where id = new.source_template_id
      and organization_id = new.organization_id;

    new.discipline_id := template_discipline_id;

    if new.classification_id is null or not exists (
      select 1
      from public.classifications classification
      where classification.id = new.classification_id
        and classification.organization_id = new.organization_id
        and classification.discipline_id = template_discipline_id
        and classification.is_active = true
    ) then
      raise exception 'Choose an active classification for this scheduled roping';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_entry_classification_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
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

  select
    classification.id,
    classification.name,
    classification.discipline_id,
    classification.rank,
    classification.eligibility_type,
    classification.minimum_age,
    classification.maximum_age,
    discipline.gender_policy,
    discipline.male_youth_maximum_age,
    discipline.male_senior_minimum_age
  into target_classification
  from public.classifications classification
  join public.disciplines discipline
    on discipline.id = classification.discipline_id
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
    eligibility_failure := 'An active membership is required for this class';
  elsif target_classification.gender_policy = 'women_only' then
    if contestant_record.competition_gender is null then
      eligibility_failure :=
        'Competition gender is required for this breakaway division';
    elsif contestant_record.competition_gender = 'male' then
      if target_classification.male_youth_maximum_age is null
        and target_classification.male_senior_minimum_age is null then
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
          target_classification.male_youth_maximum_age is not null
          and contestant_age <= target_classification.male_youth_maximum_age
        ) or (
          target_classification.male_senior_minimum_age is not null
          and contestant_age >= target_classification.male_senior_minimum_age
        );
        if not male_exception_applies then
          eligibility_failure :=
            'Contestant does not meet this organization''s male breakaway age exception';
        end if;
      end if;
    end if;
  end if;

  if eligibility_failure is null then
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
      new.eligibility_note :=
        'Guest skill eligibility accepted by event staff';
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

create or replace function public.copy_template_competition_format()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_template_id is not null then
    select
      template.competition_format,
      case
        when template.competition_format = 'four_d'
          then schedule.four_d_settings
        else null
      end
      into new.competition_format, new.four_d_settings
    from public.division_templates template
    left join public.payout_schedules schedule
      on schedule.id = template.payout_schedule_id
    where template.id = new.source_template_id
      and template.organization_id = new.organization_id;

    if new.competition_format = 'four_d' and new.four_d_settings is null then
      raise exception 'The selected 4D template needs a valid 4D payout schedule';
    end if;
  end if;
  return new;
end;
$$;

create function public.save_payout_schedule_v2(
  target_organization_id uuid,
  target_schedule_id uuid,
  schedule_name text,
  schedule_description text,
  added_money_cents integer,
  schedule_payback_basis_points integer,
  schedule_go_rounds_basis_points integer,
  schedule_aggregate_basis_points integer,
  schedule_short_round_basis_points integer,
  schedule_short_round_enabled boolean,
  schedule_competition_format public.competition_format,
  schedule_four_d_settings jsonb,
  schedule_brackets jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  saved_schedule_id uuid;
  bracket jsonb;
  place jsonb;
  saved_bracket_id uuid;
  target_stage public.payout_stage_type;
  percentage_total integer;
  place_count integer;
  highest_place integer;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to manage payout schedules';
  end if;
  if nullif(trim(schedule_name), '') is null then
    raise exception 'Schedule name is required';
  end if;
  if added_money_cents < 0 then
    raise exception 'Added money cannot be negative';
  end if;
  if schedule_competition_format not in ('standard', 'four_d') then
    raise exception 'Choose a standard or 4D payout format';
  end if;
  if schedule_competition_format = 'four_d'
    and not public.is_valid_four_d_settings(schedule_four_d_settings) then
    raise exception 'Complete the 4D payout settings';
  end if;
  if schedule_competition_format = 'standard'
    and schedule_four_d_settings is not null then
    raise exception 'Standard payout schedules cannot contain 4D settings';
  end if;
  if schedule_payback_basis_points < 1
    or schedule_payback_basis_points > 10000 then
    raise exception 'Payback must be greater than zero and no more than 100 percent';
  end if;
  if schedule_go_rounds_basis_points < 0
    or schedule_aggregate_basis_points < 0
    or schedule_short_round_basis_points < 0
    or schedule_go_rounds_basis_points + schedule_aggregate_basis_points
      + schedule_short_round_basis_points <> 10000 then
    raise exception 'Purse allocations must total 100 percent';
  end if;
  if not schedule_short_round_enabled
    and schedule_short_round_basis_points <> 0 then
    raise exception 'Enable the short round before allocating its purse';
  end if;
  if jsonb_typeof(schedule_brackets) <> 'array'
    or jsonb_array_length(schedule_brackets) = 0 then
    raise exception 'Add payout brackets for each enabled stage';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(schedule_brackets) item
    where item ->> 'stageType' = 'go_round'
  ) or not exists (
    select 1 from jsonb_array_elements(schedule_brackets) item
    where item ->> 'stageType' = 'aggregate'
  ) then
    raise exception 'Add payout brackets for go-rounds and aggregate';
  end if;
  if schedule_short_round_enabled and not exists (
    select 1 from jsonb_array_elements(schedule_brackets) item
    where item ->> 'stageType' = 'short_round'
  ) then
    raise exception 'Add payout brackets for the short round';
  end if;
  if not schedule_short_round_enabled and exists (
    select 1 from jsonb_array_elements(schedule_brackets) item
    where item ->> 'stageType' = 'short_round'
  ) then
    raise exception 'Short-round brackets require short-round payouts to be enabled';
  end if;

  if target_schedule_id is null then
    insert into public.payout_schedules (
      organization_id,
      name,
      description,
      default_added_money_cents,
      payback_basis_points,
      go_rounds_basis_points,
      aggregate_basis_points,
      short_round_basis_points,
      short_round_enabled,
      competition_format,
      four_d_settings
    ) values (
      target_organization_id,
      trim(schedule_name),
      nullif(trim(schedule_description), ''),
      added_money_cents,
      schedule_payback_basis_points,
      schedule_go_rounds_basis_points,
      schedule_aggregate_basis_points,
      schedule_short_round_basis_points,
      schedule_short_round_enabled,
      schedule_competition_format,
      schedule_four_d_settings
    ) returning id into saved_schedule_id;
  else
    update public.payout_schedules
    set name = trim(schedule_name),
        description = nullif(trim(schedule_description), ''),
        default_added_money_cents = added_money_cents,
        payback_basis_points = schedule_payback_basis_points,
        go_rounds_basis_points = schedule_go_rounds_basis_points,
        aggregate_basis_points = schedule_aggregate_basis_points,
        short_round_basis_points = schedule_short_round_basis_points,
        short_round_enabled = schedule_short_round_enabled,
        competition_format = schedule_competition_format,
        four_d_settings = schedule_four_d_settings
    where id = target_schedule_id
      and organization_id = target_organization_id
    returning id into saved_schedule_id;

    if saved_schedule_id is null then
      raise exception 'Payout schedule not found';
    end if;
    delete from public.payout_schedule_brackets
    where payout_schedule_id = saved_schedule_id;
  end if;

  for bracket in select * from jsonb_array_elements(schedule_brackets)
  loop
    begin
      target_stage := (bracket ->> 'stageType')::public.payout_stage_type;
    exception when others then
      raise exception 'Every payout bracket needs a valid stage';
    end;

    if (bracket ->> 'minimumEntries')::integer < 1
      or (
        coalesce(bracket ->> 'maximumEntries', '') <> ''
        and (bracket ->> 'maximumEntries')::integer
          < (bracket ->> 'minimumEntries')::integer
      ) then
      raise exception 'Each payout bracket needs a valid entry range';
    end if;

    select
      coalesce(sum((value ->> 'percentageBasisPoints')::integer), 0),
      count(*),
      coalesce(max((value ->> 'place')::integer), 0)
      into percentage_total, place_count, highest_place
    from jsonb_array_elements(bracket -> 'places');

    if percentage_total <> 10000 then
      raise exception 'Every payout bracket must total 100 percent';
    end if;
    if place_count = 0 or highest_place <> place_count then
      raise exception 'Paid places must be consecutive starting with first';
    end if;

    insert into public.payout_schedule_brackets (
      organization_id,
      payout_schedule_id,
      stage_type,
      minimum_entries,
      maximum_entries
    ) values (
      target_organization_id,
      saved_schedule_id,
      target_stage,
      (bracket ->> 'minimumEntries')::integer,
      case
        when coalesce(bracket ->> 'maximumEntries', '') = '' then null
        else (bracket ->> 'maximumEntries')::integer
      end
    ) returning id into saved_bracket_id;

    for place in select * from jsonb_array_elements(bracket -> 'places')
    loop
      insert into public.payout_schedule_places (
        organization_id,
        payout_bracket_id,
        place_number,
        percentage_basis_points
      ) values (
        target_organization_id,
        saved_bracket_id,
        (place ->> 'place')::integer,
        (place ->> 'percentageBasisPoints')::integer
      );
    end loop;
  end loop;

  if exists (
    select 1
    from public.payout_schedule_brackets first_bracket
    join public.payout_schedule_brackets second_bracket
      on second_bracket.payout_schedule_id = first_bracket.payout_schedule_id
     and second_bracket.stage_type = first_bracket.stage_type
     and second_bracket.id <> first_bracket.id
     and int4range(
       first_bracket.minimum_entries,
       coalesce(first_bracket.maximum_entries + 1, 2147483647),
       '[)'
     ) && int4range(
       second_bracket.minimum_entries,
       coalesce(second_bracket.maximum_entries + 1, 2147483647),
       '[)'
     )
    where first_bracket.payout_schedule_id = saved_schedule_id
  ) then
    raise exception 'Payout entry ranges cannot overlap within a stage';
  end if;

  return saved_schedule_id;
end;
$$;

revoke all on function public.save_payout_schedule_v2(
  uuid, uuid, text, text, integer, integer, integer, integer, integer, boolean,
  public.competition_format, jsonb, jsonb
) from public;
grant execute on function public.save_payout_schedule_v2(
  uuid, uuid, text, text, integer, integer, integer, integer, integer, boolean,
  public.competition_format, jsonb, jsonb
) to authenticated;

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
  classification_record public.classifications%rowtype;
  fee_record public.fee_templates%rowtype;
  template_id uuid;
  selected_classification_id uuid;
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
  if event_ends_at_local is not null
    and event_ends_at_local < event_starts_at_local then
    raise exception 'The event end must be after the event start';
  end if;
  if jsonb_typeof(event_class_occurrences) <> 'array'
    or jsonb_array_length(event_class_occurrences) = 0 then
    raise exception 'Add at least one scheduled class roping';
  end if;

  insert into public.ropings (
    organization_id,
    title,
    slug,
    venue_name,
    address,
    starts_at,
    ends_at,
    entries_open_at,
    entries_close_at,
    status,
    is_public,
    incentive_enabled
  ) values (
    target_organization_id,
    trim(event_title),
    trim(event_slug),
    nullif(trim(event_venue_name), ''),
    nullif(trim(event_address), ''),
    event_starts_at_local at time zone organization_timezone,
    case
      when event_ends_at_local is null then null
      else event_ends_at_local at time zone organization_timezone
    end,
    case
      when event_entries_open_at_local is null then null
      else event_entries_open_at_local at time zone organization_timezone
    end,
    case
      when event_entries_close_at_local is null then null
      else event_entries_close_at_local at time zone organization_timezone
    end,
    case
      when event_entries_open_at_local is not null
        and event_entries_open_at_local at time zone organization_timezone <= now()
        and (
          event_entries_close_at_local is null
          or event_entries_close_at_local at time zone organization_timezone > now()
        )
      then 'entries_open'::public.roping_status
      else 'scheduled'::public.roping_status
    end,
    event_is_public,
    false
  ) returning id into new_roping_id;

  for occurrence in select * from jsonb_array_elements(event_class_occurrences)
  loop
    template_id := (occurrence ->> 'templateId')::uuid;
    selected_classification_id := (occurrence ->> 'classificationId')::uuid;
    occurrence_date := (occurrence ->> 'scheduledDate')::date;
    occurrence_schedule_type :=
      (occurrence ->> 'scheduleType')::public.class_schedule_type;
    occurrence_round_count := (occurrence ->> 'roundCount')::integer;
    occurrence_incentive_enabled := coalesce(
      (occurrence ->> 'incentiveEnabled')::boolean,
      false
    );
    occurrence_sort_order := occurrence_sort_order + 1;

    if occurrence_round_count < 1 or occurrence_round_count > 20 then
      raise exception 'Main rounds must be between 1 and 20';
    end if;

    occurrence_starts_at := nullif(occurrence ->> 'startsAt', '')::timestamp;
    if occurrence_schedule_type in ('fixed', 'tentative')
      and occurrence_starts_at is null then
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

    select * into classification_record
    from public.classifications
    where id = selected_classification_id
      and organization_id = target_organization_id
      and discipline_id = template_record.discipline_id
      and is_active = true;

    if classification_record.id is null then
      raise exception 'Choose an active classification for each scheduled roping';
    end if;

    insert into public.roping_divisions (
      organization_id,
      roping_id,
      source_template_id,
      discipline_id,
      classification_id,
      name,
      description,
      number_of_runs,
      maximum_entries_per_person,
      allow_guests,
      eligibility_rules,
      scoring_rules,
      sort_order,
      starts_at,
      scheduled_date,
      schedule_type,
      schedule_note,
      incentive_enabled
    ) values (
      target_organization_id,
      new_roping_id,
      template_record.id,
      template_record.discipline_id,
      classification_record.id,
      classification_record.name,
      template_record.description,
      occurrence_round_count,
      template_record.maximum_entries_per_person,
      template_record.allow_guests,
      template_record.eligibility_rules,
      template_record.scoring_rules,
      occurrence_sort_order,
      case
        when occurrence_starts_at is null then null
        else occurrence_starts_at at time zone organization_timezone
      end,
      occurrence_date,
      occurrence_schedule_type,
      nullif(trim(occurrence ->> 'scheduleNote'), ''),
      occurrence_incentive_enabled
    ) returning id into new_division_id;

    perform public.apply_short_round_settings(
      target_organization_id,
      new_division_id,
      event_short_round_enabled,
      event_short_round_brackets
    );

    if template_record.payout_schedule_id is not null then
      perform public.copy_payout_schedule_to_event(
        target_organization_id,
        new_roping_id,
        new_division_id,
        null,
        template_record.payout_schedule_id,
        classification_record.name,
        'main'
      );
    end if;

    for fee_record in
      select * from public.fee_templates
      where division_template_id = template_record.id
      order by sort_order, created_at
    loop
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
        sort_order,
        kind
      ) values (
        target_organization_id,
        new_roping_id,
        new_division_id,
        fee_record.id,
        fee_record.title,
        fee_record.amount_cents,
        fee_record.scope,
        fee_record.included_in_entry_price,
        fee_record.contributes_to_payout,
        fee_record.is_required,
        fee_record.sort_order,
        fee_record.kind
      ) returning id into new_fee_id;

      if fee_record.kind in ('side_pot', 'insurance')
        and fee_record.payout_schedule_id is not null then
        perform public.copy_payout_schedule_to_event(
          target_organization_id,
          new_roping_id,
          new_division_id,
          new_fee_id,
          fee_record.payout_schedule_id,
          fee_record.title,
          'side_pot'
        );
      end if;
    end loop;

    if occurrence_incentive_enabled then
      if jsonb_typeof(occurrence -> 'incentiveRules') <> 'array'
        or jsonb_array_length(occurrence -> 'incentiveRules') = 0 then
        raise exception 'Each incentive class needs at least one handicap rule';
      end if;

      for incentive_rule in
        select * from jsonb_array_elements(occurrence -> 'incentiveRules')
      loop
        target_classification_id :=
          (incentive_rule ->> 'classificationId')::uuid;
        target_adjustment := round(
          (incentive_rule ->> 'adjustmentSeconds')::numeric,
          3
        );
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
          organization_id,
          roping_id,
          roping_division_id,
          classification_id,
          adjustment_seconds
        ) values (
          target_organization_id,
          new_roping_id,
          new_division_id,
          target_classification_id,
          target_adjustment
        );
      end loop;
    end if;
  end loop;

  update public.ropings
  set incentive_enabled = exists (
    select 1 from public.roping_divisions
    where roping_id = new_roping_id
      and incentive_enabled = true
  )
  where id = new_roping_id;

  if nullif(trim(event_fee_title), '') is not null then
    if event_fee_amount_cents is null or event_fee_amount_cents < 0 then
      raise exception 'Enter a valid event-wide charge amount';
    end if;
    insert into public.roping_fees (
      organization_id,
      roping_id,
      roping_division_id,
      title,
      amount_cents,
      scope,
      included_in_entry_price,
      contributes_to_payout,
      is_required,
      kind
    ) values (
      target_organization_id,
      new_roping_id,
      null,
      trim(event_fee_title),
      event_fee_amount_cents,
      'contestant_event',
      false,
      false,
      true,
      'standard'
    );
  end if;

  return new_roping_id;
end;
$$;

create or replace function public.submit_online_entry_request_v3(
  target_organization_slug text,
  target_roping_slug text,
  contestant_first_name text,
  contestant_last_name text,
  contestant_email text,
  contestant_phone text,
  contestant_birth_date date,
  contestant_competition_gender public.competition_gender,
  contestant_member_number text,
  contestant_note text,
  requested_divisions jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_id uuid;
begin
  if contestant_competition_gender is null then
    raise exception 'Competition gender is required';
  end if;

  if contestant_birth_date is null
    and jsonb_typeof(requested_divisions) = 'array'
    and exists (
      select 1
      from jsonb_array_elements(requested_divisions) requested
      join public.roping_divisions division
        on division.id = (requested ->> 'divisionId')::uuid
      join public.classifications classification
        on classification.id = division.classification_id
      where classification.eligibility_type = 'age'
    ) then
    raise exception 'Birth date is required for age-limited classes';
  end if;

  request_id := public.submit_online_entry_request(
    target_organization_slug,
    target_roping_slug,
    contestant_first_name,
    contestant_last_name,
    contestant_email,
    contestant_phone,
    contestant_member_number,
    contestant_note,
    requested_divisions
  );

  update public.online_entry_requests
  set birth_date = contestant_birth_date,
      competition_gender = contestant_competition_gender
  where id = request_id;

  return request_id;
end;
$$;

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
    and roping.status not in (
      'entries_closed',
      'in_progress',
      'completed',
      'cancelled'
    )
    and (
      roping.entries_open_at is null
      or roping.entries_open_at <= now()
    )
    and (
      roping.entries_close_at is null
      or roping.entries_close_at > now()
    )
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
        and (
          fee.roping_division_id = division.id
          or fee.roping_division_id is null
        )
        and fee.is_required = true
    ),
    0
  )::integer as estimated_first_entry_cents
from public.organizations organization
join public.ropings roping
  on roping.organization_id = organization.id
join public.roping_divisions division
  on division.roping_id = roping.id
left join public.classifications classification
  on classification.id = division.classification_id
where roping.is_public = true;

revoke all on public.public_event_entry_options from public;
grant select on public.public_event_entry_options to anon, authenticated;
