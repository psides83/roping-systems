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
    raise exception 'That roping template is not available in this organization';
  end if;

  copy_base_name := source_template.name || ' Copy';
  copy_name := copy_base_name;
  while exists (
    select 1
    from public.division_templates
    where organization_id = target_organization_id
      and name = copy_name
  ) loop
    copy_number := copy_number + 1;
    copy_name := copy_base_name || ' ' || copy_number;
  end loop;

  select coalesce(max(sort_order), -1) + 1 into next_sort_order
  from public.division_templates
  where organization_id = target_organization_id;

  insert into public.division_templates (
    organization_id,
    name,
    description,
    number_of_runs,
    maximum_entries_per_person,
    allow_guests,
    eligibility_rules,
    scoring_rules,
    sort_order,
    is_active,
    payout_schedule_id,
    timer_count,
    timer_resolution,
    discipline_id,
    classification_id,
    minimum_runs_between_entries,
    competition_format,
    four_d_settings,
    second_round_ordering,
    later_round_ordering
  ) values (
    target_organization_id,
    copy_name,
    source_template.description,
    source_template.number_of_runs,
    source_template.maximum_entries_per_person,
    source_template.allow_guests,
    source_template.eligibility_rules,
    source_template.scoring_rules,
    next_sort_order,
    source_template.is_active,
    source_template.payout_schedule_id,
    source_template.timer_count,
    source_template.timer_resolution,
    source_template.discipline_id,
    null,
    source_template.minimum_runs_between_entries,
    source_template.competition_format,
    null,
    source_template.second_round_ordering,
    source_template.later_round_ordering
  )
  returning id into duplicated_template_id;

  insert into public.fee_templates (
    organization_id,
    division_template_id,
    title,
    amount_cents,
    scope,
    included_in_entry_price,
    contributes_to_payout,
    is_required,
    sort_order,
    kind,
    payout_schedule_id
  )
  select
    target_organization_id,
    duplicated_template_id,
    title,
    amount_cents,
    scope,
    included_in_entry_price,
    contributes_to_payout,
    is_required,
    sort_order,
    kind,
    payout_schedule_id
  from public.fee_templates
  where division_template_id = source_template_id
    and organization_id = target_organization_id;

  return duplicated_template_id;
end;
$$;

revoke all on function public.duplicate_division_template(uuid, uuid) from public;
grant execute on function public.duplicate_division_template(uuid, uuid) to authenticated;
