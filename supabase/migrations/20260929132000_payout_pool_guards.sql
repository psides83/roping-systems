update public.roping_payout_plans plan
set added_money_cents = 0,
    payback_basis_points = 10000
where plan.pool_type = 'side_pot';

update public.roping_payout_plans plan
set aggregate_basis_points = plan.aggregate_basis_points + plan.short_round_basis_points,
    short_round_basis_points = 0
from public.roping_divisions division
where division.id = plan.roping_division_id
  and division.short_round_enabled = false
  and plan.short_round_basis_points > 0;

create or replace function public.copy_payout_schedule_to_event(
  target_organization_id uuid,
  target_roping_id uuid,
  target_division_id uuid,
  target_fee_id uuid,
  source_schedule_id uuid,
  plan_name text,
  target_pool_type public.payout_pool_type
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_plan_id uuid;
  source_bracket record;
  new_bracket_id uuid;
  schedule_record public.payout_schedules%rowtype;
  division_has_short_round boolean;
  copied_short_round_basis_points integer;
  copied_aggregate_basis_points integer;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to copy payout schedules';
  end if;

  if target_fee_id is not null then
    select id into new_plan_id
    from public.roping_payout_plans
    where roping_fee_id = target_fee_id;
    if new_plan_id is not null then return new_plan_id; end if;
  end if;

  select * into schedule_record
  from public.payout_schedules
  where id = source_schedule_id
    and organization_id = target_organization_id
    and is_active = true;
  if schedule_record.id is null then raise exception 'Payout schedule is unavailable'; end if;

  select short_round_enabled into division_has_short_round
  from public.roping_divisions
  where id = target_division_id
    and organization_id = target_organization_id;
  if division_has_short_round is null then raise exception 'Entry class is unavailable'; end if;

  copied_short_round_basis_points := case
    when division_has_short_round then schedule_record.short_round_basis_points
    else 0
  end;
  copied_aggregate_basis_points := schedule_record.aggregate_basis_points
    + case when division_has_short_round then 0 else schedule_record.short_round_basis_points end;

  insert into public.roping_payout_plans (
    organization_id, roping_id, roping_division_id, roping_fee_id,
    source_schedule_id, name, pool_type, added_money_cents,
    payback_basis_points, go_rounds_basis_points, aggregate_basis_points,
    short_round_basis_points
  ) values (
    target_organization_id, target_roping_id, target_division_id, target_fee_id,
    source_schedule_id, plan_name, target_pool_type,
    case when target_pool_type = 'main'
      then schedule_record.default_added_money_cents else 0 end,
    case when target_pool_type = 'main'
      then schedule_record.payback_basis_points else 10000 end,
    schedule_record.go_rounds_basis_points,
    copied_aggregate_basis_points,
    copied_short_round_basis_points
  ) returning id into new_plan_id;

  for source_bracket in
    select * from public.payout_schedule_brackets
    where payout_schedule_id = source_schedule_id
    order by stage_type, minimum_entries
  loop
    insert into public.roping_payout_brackets (
      organization_id, payout_plan_id, stage_type, minimum_entries, maximum_entries
    ) values (
      target_organization_id, new_plan_id, source_bracket.stage_type,
      source_bracket.minimum_entries, source_bracket.maximum_entries
    ) returning id into new_bracket_id;

    insert into public.roping_payout_places (
      organization_id, payout_bracket_id, place_number, percentage_basis_points
    )
    select target_organization_id, new_bracket_id, place_number, percentage_basis_points
    from public.payout_schedule_places
    where payout_bracket_id = source_bracket.id;
  end loop;

  return new_plan_id;
end;
$$;
