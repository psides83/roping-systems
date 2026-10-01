create function public.calculate_four_d_payout_breakdown(target_plan_id uuid)
returns table (
  entry_count integer,
  total_pool_cents bigint,
  d_number integer,
  d_pool_cents bigint,
  place_number integer,
  place_percentage_basis_points integer,
  payout_cents bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with plan as (
    select payout_plan.*, division.four_d_settings
    from public.roping_payout_plans payout_plan
    join public.roping_divisions division on division.id = payout_plan.roping_division_id
    where payout_plan.id = target_plan_id
      and payout_plan.pool_type = 'main'
      and division.competition_format = 'four_d'
      and public.has_organization_access(payout_plan.organization_id)
  ), summary as (
    select calculation.entry_count, calculation.pool_cents
    from public.calculate_roping_payouts(target_plan_id) calculation
    limit 1
  ), settings as (
    select bracket.value as bracket
    from plan
    cross join summary
    cross join lateral jsonb_array_elements(plan.four_d_settings -> 'brackets') bracket(value)
    where summary.entry_count >= (bracket.value ->> 'minimumEntries')::integer
      and (
        nullif(bracket.value ->> 'maximumEntries', '') is null
        or summary.entry_count <= (bracket.value ->> 'maximumEntries')::integer
      )
    order by (bracket.value ->> 'minimumEntries')::integer desc
    limit 1
  ), selected_place_bracket as (
    select bracket.id
    from public.roping_payout_brackets bracket
    join plan on plan.id = bracket.payout_plan_id
    cross join summary
    where bracket.stage_type = 'go_round'
      and summary.entry_count >= bracket.minimum_entries
      and (bracket.maximum_entries is null or summary.entry_count <= bracket.maximum_entries)
    order by bracket.minimum_entries desc
    limit 1
  ), divisions as (
    select generated.d_number,
      (settings.bracket -> 'purseBasisPoints' ->> (generated.d_number - 1))::integer
        as purse_basis_points,
      (settings.bracket -> 'placesByDivision' ->> (generated.d_number - 1))::integer
        as places_paid
    from settings
    cross join lateral generate_series(
      1,
      (settings.bracket ->> 'activeDivisions')::integer
    ) generated(d_number)
  ), division_pools as (
    select divisions.*,
      floor(summary.pool_cents * divisions.purse_basis_points / 10000.0)::bigint
        + case when divisions.d_number = 1 then summary.pool_cents - sum(
            floor(summary.pool_cents * divisions.purse_basis_points / 10000.0)::bigint
          ) over () else 0 end as d_pool_cents
    from divisions cross join summary
  ), place_weights as (
    select division_pool.d_number, division_pool.d_pool_cents,
      place.place_number, place.percentage_basis_points,
      sum(place.percentage_basis_points) over (
        partition by division_pool.d_number
      )::integer as selected_weight_total
    from division_pools division_pool
    join selected_place_bracket selected on true
    join public.roping_payout_places place on place.payout_bracket_id = selected.id
      and place.place_number <= division_pool.places_paid
  ), base_amounts as (
    select place_weight.*,
      floor(
        place_weight.d_pool_cents * place_weight.percentage_basis_points
        / place_weight.selected_weight_total::numeric
      )::bigint as base_amount
    from place_weights place_weight
  )
  select summary.entry_count, summary.pool_cents,
    amount.d_number, amount.d_pool_cents, amount.place_number,
    round(amount.percentage_basis_points * 10000.0 / amount.selected_weight_total)::integer,
    amount.base_amount + case when amount.place_number = 1
      then amount.d_pool_cents - sum(amount.base_amount) over (partition by amount.d_number)
      else 0 end
  from base_amounts amount cross join summary
  order by amount.d_number, amount.place_number;
$$;

revoke all on function public.calculate_four_d_payout_breakdown(uuid) from public;
grant execute on function public.calculate_four_d_payout_breakdown(uuid) to authenticated;

create function public.calculate_four_d_payout_results(target_plan_id uuid)
returns table (
  d_number integer,
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
    select payout_plan.*, division.four_d_settings
    from public.roping_payout_plans payout_plan
    join public.roping_divisions division on division.id = payout_plan.roping_division_id
    where payout_plan.id = target_plan_id
      and payout_plan.pool_type = 'main'
      and division.competition_format = 'four_d'
      and public.has_organization_access(payout_plan.organization_id)
  ), summary as (
    select calculation.entry_count, calculation.pool_cents
    from public.calculate_roping_payouts(target_plan_id) calculation
    limit 1
  ), settings as (
    select bracket.value as bracket, (plan.four_d_settings ->> 'splitSeconds')::numeric as split_seconds
    from plan
    cross join summary
    cross join lateral jsonb_array_elements(plan.four_d_settings -> 'brackets') bracket(value)
    where summary.entry_count >= (bracket.value ->> 'minimumEntries')::integer
      and (
        nullif(bracket.value ->> 'maximumEntries', '') is null
        or summary.entry_count <= (bracket.value ->> 'maximumEntries')::integer
      )
    order by (bracket.value ->> 'minimumEntries')::integer desc
    limit 1
  ), completed as (
    select entry.id as entry_id, entry.person_id,
      greatest(run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds, 0)
        as performance_seconds
    from plan
    join public.entries entry on entry.roping_division_id = plan.roping_division_id
      and entry.payment_status in ('paid_cash', 'comped')
    join public.runs run on run.entry_id = entry.id
      and run.run_number = 1
      and run.status = 'complete'
      and run.raw_time_seconds is not null
  ), fastest as (
    select min(performance_seconds) as fastest_time from completed
  ), ranked as (
    select completed.*,
      least(
        (settings.bracket ->> 'activeDivisions')::integer,
        floor((completed.performance_seconds - fastest.fastest_time) / settings.split_seconds)::integer + 1
      )::integer as d_number,
      rank() over (
        partition by least(
          (settings.bracket ->> 'activeDivisions')::integer,
          floor((completed.performance_seconds - fastest.fastest_time) / settings.split_seconds)::integer + 1
        )
        order by completed.performance_seconds
      )::integer as place_number,
      count(*) over (
        partition by least(
          (settings.bracket ->> 'activeDivisions')::integer,
          floor((completed.performance_seconds - fastest.fastest_time) / settings.split_seconds)::integer + 1
        ), completed.performance_seconds
      )::integer as tie_count,
      row_number() over (
        partition by least(
          (settings.bracket ->> 'activeDivisions')::integer,
          floor((completed.performance_seconds - fastest.fastest_time) / settings.split_seconds)::integer + 1
        ), completed.performance_seconds
        order by completed.entry_id
      )::integer as tie_index
    from completed cross join fastest cross join settings
  ), tied_payouts as (
    select ranking.d_number, ranking.place_number, ranking.entry_id,
      ranking.person_id, ranking.performance_seconds, ranking.tie_count,
      ranking.tie_index, coalesce(sum(payout.payout_cents), 0)::bigint as combined_cents
    from ranked ranking
    left join public.calculate_four_d_payout_breakdown(target_plan_id) payout
      on payout.d_number = ranking.d_number
      and payout.place_number between ranking.place_number
        and ranking.place_number + ranking.tie_count - 1
    group by ranking.d_number, ranking.place_number, ranking.entry_id,
      ranking.person_id, ranking.performance_seconds, ranking.tie_count,
      ranking.tie_index
    having count(payout.place_number) > 0
  )
  select payout.d_number, payout.place_number, payout.entry_id,
    trim(person.first_name || ' ' || person.last_name),
    payout.performance_seconds,
    floor(payout.combined_cents / payout.tie_count)::bigint
      + case when payout.tie_index <= mod(payout.combined_cents, payout.tie_count)
        then 1 else 0 end
  from tied_payouts payout
  join public.people person on person.id = payout.person_id
  order by payout.d_number, payout.place_number, payout.entry_id;
$$;

revoke all on function public.calculate_four_d_payout_results(uuid) from public;
grant execute on function public.calculate_four_d_payout_results(uuid) to authenticated;
