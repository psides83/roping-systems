create type public.payout_stage_type as enum ('go_round', 'aggregate', 'short_round');

alter table public.payout_schedules
  drop constraint payout_schedule_stage_allocation_total,
  add column short_round_basis_points integer not null default 0
    check (short_round_basis_points between 0 and 10000),
  add constraint payout_schedule_stage_allocation_total
    check (
      go_rounds_basis_points + aggregate_basis_points + short_round_basis_points = 10000
    );

alter table public.roping_payout_plans
  drop constraint roping_payout_stage_allocation_total,
  add column short_round_basis_points integer not null default 0
    check (short_round_basis_points between 0 and 10000),
  add constraint roping_payout_stage_allocation_total
    check (
      go_rounds_basis_points + aggregate_basis_points + short_round_basis_points = 10000
    );

alter table public.payout_schedule_brackets
  drop constraint payout_schedule_brackets_payout_schedule_id_minimum_entries_key,
  add column stage_type public.payout_stage_type not null default 'go_round';

alter table public.roping_payout_brackets
  drop constraint roping_payout_brackets_payout_plan_id_minimum_entries_key,
  add column stage_type public.payout_stage_type not null default 'go_round';

do $$
declare
  source_bracket record;
  copied_bracket_id uuid;
  target_stage public.payout_stage_type;
begin
  for source_bracket in
    select * from public.payout_schedule_brackets where stage_type = 'go_round'
  loop
    foreach target_stage in array array[
      'aggregate'::public.payout_stage_type,
      'short_round'::public.payout_stage_type
    ] loop
      insert into public.payout_schedule_brackets (
        organization_id, payout_schedule_id, stage_type,
        minimum_entries, maximum_entries
      ) values (
        source_bracket.organization_id, source_bracket.payout_schedule_id,
        target_stage, source_bracket.minimum_entries, source_bracket.maximum_entries
      ) returning id into copied_bracket_id;

      insert into public.payout_schedule_places (
        organization_id, payout_bracket_id, place_number, percentage_basis_points
      )
      select organization_id, copied_bracket_id, place_number, percentage_basis_points
      from public.payout_schedule_places
      where payout_bracket_id = source_bracket.id;
    end loop;
  end loop;

  for source_bracket in
    select * from public.roping_payout_brackets where stage_type = 'go_round'
  loop
    foreach target_stage in array array[
      'aggregate'::public.payout_stage_type,
      'short_round'::public.payout_stage_type
    ] loop
      insert into public.roping_payout_brackets (
        organization_id, payout_plan_id, stage_type,
        minimum_entries, maximum_entries
      ) values (
        source_bracket.organization_id, source_bracket.payout_plan_id,
        target_stage, source_bracket.minimum_entries, source_bracket.maximum_entries
      ) returning id into copied_bracket_id;

      insert into public.roping_payout_places (
        organization_id, payout_bracket_id, place_number, percentage_basis_points
      )
      select organization_id, copied_bracket_id, place_number, percentage_basis_points
      from public.roping_payout_places
      where payout_bracket_id = source_bracket.id;
    end loop;
  end loop;
end;
$$;

alter table public.payout_schedule_brackets
  add constraint payout_schedule_brackets_stage_minimum_key
    unique (payout_schedule_id, stage_type, minimum_entries);

alter table public.roping_payout_brackets
  add constraint roping_payout_brackets_stage_minimum_key
    unique (payout_plan_id, stage_type, minimum_entries);

drop function public.save_payout_schedule(
  uuid, uuid, text, text, integer, integer, integer, integer, jsonb
);

create function public.save_payout_schedule(
  target_organization_id uuid,
  target_schedule_id uuid,
  schedule_name text,
  schedule_description text,
  added_money_cents integer,
  schedule_payback_basis_points integer,
  schedule_go_rounds_basis_points integer,
  schedule_aggregate_basis_points integer,
  schedule_short_round_basis_points integer,
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
  if nullif(trim(schedule_name), '') is null then raise exception 'Schedule name is required'; end if;
  if added_money_cents < 0 then raise exception 'Added money cannot be negative'; end if;
  if schedule_payback_basis_points < 1 or schedule_payback_basis_points > 10000 then
    raise exception 'Payback must be greater than zero and no more than 100 percent';
  end if;
  if schedule_go_rounds_basis_points < 0
    or schedule_aggregate_basis_points < 0
    or schedule_short_round_basis_points < 0
    or schedule_go_rounds_basis_points + schedule_aggregate_basis_points
      + schedule_short_round_basis_points <> 10000 then
    raise exception 'Go-round, aggregate, and short-round allocations must total 100 percent';
  end if;
  if jsonb_typeof(schedule_brackets) <> 'array' or jsonb_array_length(schedule_brackets) = 0 then
    raise exception 'Add payout brackets for every stage';
  end if;
  if exists (
    select 1
    from unnest(enum_range(null::public.payout_stage_type)) stage
    where not exists (
      select 1 from jsonb_array_elements(schedule_brackets) item
      where item ->> 'stageType' = stage::text
    )
  ) then
    raise exception 'Add payout brackets for go-rounds, aggregate, and short round';
  end if;

  if target_schedule_id is null then
    insert into public.payout_schedules (
      organization_id, name, description, default_added_money_cents,
      payback_basis_points, go_rounds_basis_points, aggregate_basis_points,
      short_round_basis_points
    ) values (
      target_organization_id, trim(schedule_name), nullif(trim(schedule_description), ''),
      added_money_cents, schedule_payback_basis_points,
      schedule_go_rounds_basis_points, schedule_aggregate_basis_points,
      schedule_short_round_basis_points
    ) returning id into saved_schedule_id;
  else
    update public.payout_schedules
    set name = trim(schedule_name),
        description = nullif(trim(schedule_description), ''),
        default_added_money_cents = added_money_cents,
        payback_basis_points = schedule_payback_basis_points,
        go_rounds_basis_points = schedule_go_rounds_basis_points,
        aggregate_basis_points = schedule_aggregate_basis_points,
        short_round_basis_points = schedule_short_round_basis_points
    where id = target_schedule_id and organization_id = target_organization_id
    returning id into saved_schedule_id;
    if saved_schedule_id is null then raise exception 'Payout schedule not found'; end if;
    delete from public.payout_schedule_brackets where payout_schedule_id = saved_schedule_id;
  end if;

  for bracket in select * from jsonb_array_elements(schedule_brackets)
  loop
    begin
      target_stage := (bracket ->> 'stageType')::public.payout_stage_type;
    exception when others then
      raise exception 'Every payout bracket needs a valid stage';
    end;
    if (bracket ->> 'minimumEntries')::integer < 1
      or ((bracket ->> 'maximumEntries') is not null and (bracket ->> 'maximumEntries') <> ''
        and (bracket ->> 'maximumEntries')::integer < (bracket ->> 'minimumEntries')::integer) then
      raise exception 'Each payout bracket needs a valid entry range';
    end if;

    select coalesce(sum((value ->> 'percentageBasisPoints')::integer), 0),
      count(*), coalesce(max((value ->> 'place')::integer), 0)
      into percentage_total, place_count, highest_place
    from jsonb_array_elements(bracket -> 'places');
    if percentage_total <> 10000 then raise exception 'Every payout bracket must total 100 percent'; end if;
    if place_count = 0 or highest_place <> place_count then
      raise exception 'Paid places must be consecutive starting with first';
    end if;

    insert into public.payout_schedule_brackets (
      organization_id, payout_schedule_id, stage_type, minimum_entries, maximum_entries
    ) values (
      target_organization_id, saved_schedule_id, target_stage,
      (bracket ->> 'minimumEntries')::integer,
      case when coalesce(bracket ->> 'maximumEntries', '') = '' then null
        else (bracket ->> 'maximumEntries')::integer end
    ) returning id into saved_bracket_id;

    for place in select * from jsonb_array_elements(bracket -> 'places')
    loop
      insert into public.payout_schedule_places (
        organization_id, payout_bracket_id, place_number, percentage_basis_points
      ) values (
        target_organization_id, saved_bracket_id,
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
     and int4range(first_bracket.minimum_entries, coalesce(first_bracket.maximum_entries + 1, 2147483647), '[)')
       && int4range(second_bracket.minimum_entries, coalesce(second_bracket.maximum_entries + 1, 2147483647), '[)')
    where first_bracket.payout_schedule_id = saved_schedule_id
  ) then
    raise exception 'Payout entry ranges cannot overlap within a stage';
  end if;

  return saved_schedule_id;
end;
$$;

revoke all on function public.save_payout_schedule(
  uuid, uuid, text, text, integer, integer, integer, integer, integer, jsonb
) from public;
grant execute on function public.save_payout_schedule(
  uuid, uuid, text, text, integer, integer, integer, integer, integer, jsonb
) to authenticated;

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
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to copy payout schedules';
  end if;

  if target_fee_id is not null then
    select id into new_plan_id from public.roping_payout_plans where roping_fee_id = target_fee_id;
    if new_plan_id is not null then return new_plan_id; end if;
  end if;

  select * into schedule_record from public.payout_schedules
  where id = source_schedule_id
    and organization_id = target_organization_id
    and is_active = true;
  if schedule_record.id is null then raise exception 'Payout schedule is unavailable'; end if;

  insert into public.roping_payout_plans (
    organization_id, roping_id, roping_division_id, roping_fee_id,
    source_schedule_id, name, pool_type, added_money_cents,
    payback_basis_points, go_rounds_basis_points, aggregate_basis_points,
    short_round_basis_points
  ) values (
    target_organization_id, target_roping_id, target_division_id, target_fee_id,
    source_schedule_id, plan_name, target_pool_type,
    schedule_record.default_added_money_cents,
    schedule_record.payback_basis_points,
    schedule_record.go_rounds_basis_points,
    schedule_record.aggregate_basis_points,
    schedule_record.short_round_basis_points
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

drop function public.calculate_roping_payouts(uuid);

create function public.calculate_roping_payouts(target_plan_id uuid)
returns table (
  entry_count integer,
  pool_cents bigint,
  stage_type text,
  place_number integer,
  percentage_basis_points integer,
  payout_cents bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  plan_record public.roping_payout_plans%rowtype;
  calculated_entries integer;
  gross_pool bigint;
  calculated_pool bigint;
begin
  select * into plan_record from public.roping_payout_plans where id = target_plan_id;
  if plan_record.id is null or not public.has_organization_access(plan_record.organization_id) then
    raise exception 'Payout plan is unavailable';
  end if;

  if plan_record.pool_type = 'main' then
    select count(*)::integer into calculated_entries
    from public.entries
    where roping_division_id = plan_record.roping_division_id
      and payment_status in ('paid_cash', 'comped');
    select coalesce(sum(charge.amount_cents), 0) into gross_pool
    from public.entry_charges charge
    join public.roping_fees fee on fee.id = charge.roping_fee_id
    join public.entries entry on entry.id = charge.entry_id
    where fee.contributes_to_payout = true
      and fee.kind not in ('side_pot', 'insurance')
      and fee.roping_division_id = plan_record.roping_division_id
      and entry.roping_division_id = plan_record.roping_division_id
      and entry.payment_status in ('paid_cash', 'comped')
      and charge.waived_at is null;
  else
    select count(*)::integer, coalesce(sum(charge.amount_cents), 0)
      into calculated_entries, gross_pool
    from public.entry_charges charge
    join public.entries entry on entry.id = charge.entry_id
    where charge.roping_fee_id = plan_record.roping_fee_id
      and charge.waived_at is null
      and entry.payment_status in ('paid_cash', 'comped');
  end if;

  calculated_pool := floor(gross_pool * plan_record.payback_basis_points / 10000.0)::bigint
    + plan_record.added_money_cents;

  return query
  with stage_pools as (
    select 'go_round'::public.payout_stage_type as stage,
      floor(calculated_pool * plan_record.go_rounds_basis_points / 10000.0)::bigint as amount
    union all
    select 'short_round'::public.payout_stage_type,
      floor(calculated_pool * plan_record.short_round_basis_points / 10000.0)::bigint
    union all
    select 'aggregate'::public.payout_stage_type,
      calculated_pool
        - floor(calculated_pool * plan_record.go_rounds_basis_points / 10000.0)::bigint
        - floor(calculated_pool * plan_record.short_round_basis_points / 10000.0)::bigint
  ), selected_brackets as (
    select distinct on (bracket.stage_type) bracket.id, bracket.stage_type
    from public.roping_payout_brackets bracket
    where bracket.payout_plan_id = plan_record.id
      and calculated_entries >= bracket.minimum_entries
      and (bracket.maximum_entries is null or calculated_entries <= bracket.maximum_entries)
    order by bracket.stage_type, bracket.minimum_entries desc
  ), amounts as (
    select selected.stage_type, place.place_number, place.percentage_basis_points,
      floor(pool.amount * place.percentage_basis_points / 10000.0)::bigint as base_amount,
      pool.amount
    from selected_brackets selected
    join stage_pools pool on pool.stage = selected.stage_type
    join public.roping_payout_places place on place.payout_bracket_id = selected.id
  ), totals as (
    select amounts.stage_type, coalesce(sum(base_amount), 0)::bigint as allocated
    from amounts group by amounts.stage_type
  )
  select calculated_entries, calculated_pool, amounts.stage_type::text,
    amounts.place_number, amounts.percentage_basis_points,
    amounts.base_amount + case when amounts.place_number = 1
      then amounts.amount - totals.allocated else 0 end
  from amounts join totals using (stage_type)
  order by amounts.stage_type, amounts.place_number;

  if not found then
    return query select calculated_entries, calculated_pool, null::text,
      null::integer, null::integer, null::bigint;
  end if;
end;
$$;

grant execute on function public.calculate_roping_payouts(uuid) to authenticated;

drop function public.calculate_roping_payout_results(uuid);

create function public.calculate_roping_payout_results(target_plan_id uuid)
returns table (
  section_type text,
  round_number integer,
  place_number integer,
  entry_id uuid,
  contestant_name text,
  performance_seconds numeric,
  payout_cents bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with plan as (
    select payout_plan.*, fee.kind as fee_kind, division.number_of_runs,
      division.short_round_enabled
    from public.roping_payout_plans payout_plan
    join public.roping_divisions division on division.id = payout_plan.roping_division_id
    left join public.roping_fees fee on fee.id = payout_plan.roping_fee_id
    where payout_plan.id = target_plan_id
      and public.has_organization_access(payout_plan.organization_id)
  ), paid_entries as (
    select entry.*
    from public.entries entry
    join plan on plan.roping_division_id = entry.roping_division_id
    where entry.payment_status in ('paid_cash', 'comped')
  ), plan_summary as (
    select calculation.entry_count, calculation.pool_cents
    from public.calculate_roping_payouts(target_plan_id) calculation limit 1
  ), stage_brackets as (
    select distinct on (bracket.stage_type) bracket.id, bracket.stage_type
    from public.roping_payout_brackets bracket
    join plan on plan.id = bracket.payout_plan_id
    cross join plan_summary summary
    where summary.entry_count >= bracket.minimum_entries
      and (bracket.maximum_entries is null or summary.entry_count <= bracket.maximum_entries)
    order by bracket.stage_type, bracket.minimum_entries desc
  ), paid_places as (
    select bracket.stage_type, place.place_number, place.percentage_basis_points
    from stage_brackets bracket
    join public.roping_payout_places place on place.payout_bracket_id = bracket.id
  ), main_plan as (
    select payout_plan.id
    from public.roping_payout_plans payout_plan
    join plan on plan.roping_division_id = payout_plan.roping_division_id
    where payout_plan.pool_type = 'main' limit 1
  ), main_brackets as (
    select distinct on (bracket.stage_type) bracket.id, bracket.stage_type
    from public.roping_payout_brackets bracket
    join main_plan on main_plan.id = bracket.payout_plan_id
    where (select count(*) from paid_entries) >= bracket.minimum_entries
      and (bracket.maximum_entries is null
        or (select count(*) from paid_entries) <= bracket.maximum_entries)
    order by bracket.stage_type, bracket.minimum_entries desc
  ), main_place_counts as (
    select bracket.stage_type, count(*)::integer as total
    from main_brackets bracket
    join public.roping_payout_places place on place.payout_bracket_id = bracket.id
    group by bracket.stage_type
  ), sections as (
    select 'round'::text as section_type, generated.round_number::integer,
      'go_round'::public.payout_stage_type as stage_type,
      floor(floor(summary.pool_cents * plan.go_rounds_basis_points / 10000.0)
        / plan.number_of_runs)::bigint
      + case when generated.round_number <= mod(
          floor(summary.pool_cents * plan.go_rounds_basis_points / 10000.0)::bigint,
          plan.number_of_runs
        ) then 1 else 0 end as section_pool_cents
    from plan cross join plan_summary summary
    cross join generate_series(1, plan.number_of_runs) generated(round_number)
    union all
    select 'short_round', plan.number_of_runs + 1, 'short_round',
      floor(summary.pool_cents * plan.short_round_basis_points / 10000.0)::bigint
    from plan cross join plan_summary summary
    where plan.short_round_enabled and plan.short_round_basis_points > 0
    union all
    select 'aggregate', null, 'aggregate',
      summary.pool_cents
        - floor(summary.pool_cents * plan.go_rounds_basis_points / 10000.0)::bigint
        - floor(summary.pool_cents * plan.short_round_basis_points / 10000.0)::bigint
    from plan cross join plan_summary summary
  ), performances as (
    select case when run.run_number <= plan.number_of_runs then 'round' else 'short_round' end as section_type,
      run.run_number, entry.id as entry_id,
      greatest(run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds, 0)
        as performance_seconds
    from paid_entries entry
    join public.runs run on run.entry_id = entry.id
    join plan on true
    where run.run_number <= plan.number_of_runs + case when plan.short_round_enabled then 1 else 0 end
      and run.status = 'complete'
    union all
    select 'aggregate', null, entry.id,
      sum(greatest(run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds, 0))
    from paid_entries entry
    join public.runs run on run.entry_id = entry.id
    join plan on true
    where run.run_number <= plan.number_of_runs + case when plan.short_round_enabled then 1 else 0 end
      and run.status = 'complete'
    group by entry.id, plan.number_of_runs, plan.short_round_enabled
    having count(*) = plan.number_of_runs + case when plan.short_round_enabled then 1 else 0 end
  ), ranked_main as (
    select performance.*,
      rank() over (
        partition by performance.section_type, performance.run_number
        order by performance.performance_seconds
      )::integer as main_place
    from performances performance
  ), pool_eligible as (
    select ranking.*
    from ranked_main ranking cross join plan
    left join main_place_counts main_count on main_count.stage_type = case ranking.section_type
      when 'round' then 'go_round'::public.payout_stage_type
      when 'short_round' then 'short_round'::public.payout_stage_type
      else 'aggregate'::public.payout_stage_type end
    where (plan.pool_type = 'main' or exists (
      select 1 from public.entry_charges charge
      where charge.entry_id = ranking.entry_id
        and charge.roping_fee_id = plan.roping_fee_id and charge.waived_at is null
    ))
    and not (plan.fee_kind = 'insurance'
      and ranking.main_place <= coalesce(main_count.total, 0))
  ), pool_rankings as (
    select eligible.*,
      rank() over (
        partition by eligible.section_type, eligible.run_number
        order by eligible.performance_seconds
      )::integer as pool_place,
      count(*) over (
        partition by eligible.section_type, eligible.run_number, eligible.performance_seconds
      )::integer as tie_count,
      row_number() over (
        partition by eligible.section_type, eligible.run_number, eligible.performance_seconds
        order by eligible.entry_id
      )::integer as tie_index
    from pool_eligible eligible
  ), stage_amounts as (
    select section.section_type, section.round_number, section.stage_type,
      place.place_number,
      floor(section.section_pool_cents * place.percentage_basis_points / 10000.0)::bigint
        + case when place.place_number = 1 then section.section_pool_cents - sum(
            floor(section.section_pool_cents * place.percentage_basis_points / 10000.0)::bigint
          ) over (partition by section.section_type, section.round_number)
          else 0 end as amount_cents
    from sections section
    join paid_places place on place.stage_type = section.stage_type
  ), tied_payouts as (
    select ranking.section_type, ranking.run_number, ranking.entry_id,
      ranking.performance_seconds, ranking.pool_place, ranking.tie_count,
      ranking.tie_index,
      coalesce(sum(amount.amount_cents), 0)::bigint as combined_cents
    from pool_rankings ranking
    join sections section on section.section_type = ranking.section_type
      and section.round_number is not distinct from ranking.run_number
    left join stage_amounts amount on amount.section_type = ranking.section_type
      and amount.round_number is not distinct from ranking.run_number
      and amount.place_number between ranking.pool_place
        and ranking.pool_place + ranking.tie_count - 1
    group by ranking.section_type, ranking.run_number, ranking.entry_id,
      ranking.performance_seconds, ranking.pool_place, ranking.tie_count, ranking.tie_index
    having count(amount.place_number) > 0
  )
  select ranking.section_type, ranking.run_number, ranking.pool_place,
    ranking.entry_id, trim(person.first_name || ' ' || person.last_name),
    ranking.performance_seconds,
    floor(ranking.combined_cents / ranking.tie_count)::bigint
      + case when ranking.tie_index <= mod(ranking.combined_cents, ranking.tie_count)
        then 1 else 0 end
  from tied_payouts ranking
  join paid_entries entry on entry.id = ranking.entry_id
  join public.people person on person.id = entry.person_id
  order by case ranking.section_type when 'round' then 0 when 'short_round' then 1 else 2 end,
    ranking.run_number, ranking.pool_place, ranking.entry_id;
$$;

revoke all on function public.calculate_roping_payout_results(uuid) from public;
grant execute on function public.calculate_roping_payout_results(uuid) to authenticated;
