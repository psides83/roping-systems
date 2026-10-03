alter table public.division_templates
  add column cattle_draw_enabled boolean not null default false;

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
    short_round_enabled, short_round_tie_policy, short_round_brackets,
    cattle_draw_enabled
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
    source_template.short_round_brackets,
    source_template.cattle_draw_enabled
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

create or replace function public.add_roping_to_event(
  target_roping_id uuid,
  target_template_id uuid,
  target_classification_id uuid,
  target_scheduled_date date,
  target_schedule_type public.class_schedule_type,
  target_starts_at_local timestamp without time zone,
  target_schedule_note text,
  target_arena_name text,
  target_round_count integer,
  target_cattle_draw_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.ropings%rowtype;
  template_record public.division_templates%rowtype;
  classification_record public.classifications%rowtype;
  fee_record public.fee_templates%rowtype;
  handicap_rule jsonb;
  new_division_id uuid;
  new_fee_id uuid;
  organization_timezone text;
  event_start_date date;
  event_end_date date;
  next_sort_order integer;
  rule_classification_id uuid;
  rule_adjustment numeric(8, 3);
begin
  select * into event_record
  from public.ropings
  where id = target_roping_id
  for update;

  if event_record.id is null
    or not public.can_manage_organization(event_record.organization_id) then
    raise exception 'You do not have permission to edit this event';
  end if;
  if event_record.status in ('completed', 'cancelled') then
    raise exception 'Ropings cannot be added to a completed or cancelled event';
  end if;
  if target_schedule_type in ('fixed', 'tentative')
    and target_starts_at_local is null then
    raise exception 'Set and tentative schedules require a start time';
  end if;
  if target_schedule_type = 'follows_previous' and not exists (
    select 1 from public.roping_divisions
    where roping_id = target_roping_id
      and scheduled_date = target_scheduled_date
      and arena_name = target_arena_name
  ) then
    raise exception 'A follows-previous roping needs an earlier roping in the same arena';
  end if;

  select * into template_record
  from public.division_templates
  where id = target_template_id
    and organization_id = event_record.organization_id
    and is_active = true;
  if template_record.id is null then
    raise exception 'That roping template is unavailable';
  end if;

  select timezone into organization_timezone
  from public.organizations
  where id = event_record.organization_id;
  event_start_date := (event_record.starts_at at time zone organization_timezone)::date;
  event_end_date := coalesce(
    (event_record.ends_at at time zone organization_timezone)::date,
    event_start_date
  );
  if target_scheduled_date < event_start_date
    or target_scheduled_date > event_end_date then
    raise exception 'The roping date must fall within the event dates';
  end if;

  if template_record.competition_format = 'handicap' then
    select * into classification_record
    from public.classifications
    where organization_id = event_record.organization_id
      and discipline_id = template_record.discipline_id
      and is_active = true
    order by rank desc, created_at
    limit 1;
  else
    select * into classification_record
    from public.classifications
    where id = target_classification_id
      and organization_id = event_record.organization_id
      and discipline_id = template_record.discipline_id
      and is_active = true;
  end if;
  if classification_record.id is null then
    raise exception 'Choose an active classification for this roping';
  end if;

  select coalesce(max(sort_order), 0) + 1 into next_sort_order
  from public.roping_divisions
  where roping_id = target_roping_id;

  insert into public.roping_divisions (
    organization_id, roping_id, source_template_id, discipline_id,
    classification_id, name, description, number_of_runs,
    maximum_entries_per_person, minimum_runs_between_entries, allow_guests,
    eligibility_rules, scoring_rules, sort_order, starts_at, scheduled_date,
    schedule_type, schedule_note, incentive_enabled, arena_name,
    cattle_draw_enabled, timer_count, timer_resolution, competition_format,
    second_round_ordering, later_round_ordering
  ) values (
    event_record.organization_id, event_record.id, template_record.id,
    template_record.discipline_id, classification_record.id,
    case when template_record.competition_format = 'handicap'
      then 'Handicap' else classification_record.name end,
    template_record.description, template_record.number_of_runs,
    template_record.maximum_entries_per_person,
    template_record.minimum_runs_between_entries, template_record.allow_guests,
    template_record.eligibility_rules, template_record.scoring_rules,
    next_sort_order,
    case when target_schedule_type = 'follows_previous' then null
      else target_starts_at_local at time zone organization_timezone end,
    target_scheduled_date, target_schedule_type,
    nullif(trim(target_schedule_note), ''),
    template_record.competition_format = 'handicap',
    nullif(trim(target_arena_name), ''), template_record.cattle_draw_enabled,
    template_record.timer_count, template_record.timer_resolution,
    template_record.competition_format, template_record.second_round_ordering,
    template_record.later_round_ordering
  ) returning id into new_division_id;

  perform public.apply_template_short_round_settings(new_division_id);

  if template_record.competition_format = 'handicap' then
    update public.roping_divisions
    set classification_id = null
    where id = new_division_id;
    for handicap_rule in
      select * from jsonb_array_elements(template_record.handicap_rules)
    loop
      rule_classification_id := (handicap_rule ->> 'classificationId')::uuid;
      rule_adjustment := round(
        (handicap_rule ->> 'adjustmentSeconds')::numeric,
        3
      );
      insert into public.roping_incentive_rules (
        organization_id, roping_id, roping_division_id, classification_id,
        adjustment_seconds
      ) values (
        event_record.organization_id, event_record.id, new_division_id,
        rule_classification_id, rule_adjustment
      );
    end loop;
  end if;

  if template_record.payout_schedule_id is not null then
    perform public.copy_payout_schedule_to_event(
      event_record.organization_id, event_record.id, new_division_id, null,
      template_record.payout_schedule_id,
      case when template_record.competition_format = 'handicap'
        then 'Handicap' else classification_record.name end,
      'main'
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
      event_record.organization_id, event_record.id, new_division_id,
      fee_record.id, fee_record.title, fee_record.amount_cents,
      fee_record.scope, fee_record.included_in_entry_price,
      fee_record.contributes_to_payout, fee_record.is_required,
      fee_record.sort_order, fee_record.kind
    ) returning id into new_fee_id;
    if fee_record.kind in ('side_pot', 'insurance')
      and fee_record.payout_schedule_id is not null then
      perform public.copy_payout_schedule_to_event(
        event_record.organization_id, event_record.id, new_division_id,
        new_fee_id, fee_record.payout_schedule_id, fee_record.title,
        'side_pot'
      );
    end if;
  end loop;

  update public.ropings
  set incentive_enabled = exists (
    select 1 from public.roping_divisions
    where roping_id = event_record.id and incentive_enabled
  )
  where id = event_record.id;

  return new_division_id;
end;
$$;
