-- Reuse the payout engine for published events without exposing private plans.
create function public.is_payout_plan_public(target_plan_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.event_roping_payout_plans plan
    join public.events event on event.id = plan.event_id
    where plan.id = target_plan_id and event.publication_state = 'published'
      and event.is_public = true
  );
$$;
revoke all on function public.is_payout_plan_public(uuid) from public, anon, authenticated;

do $$
declare
  function_name text;
  definition text;
begin
  foreach function_name in array array[
    'calculate_roping_payouts', 'calculate_roping_payout_results',
    'calculate_four_d_payout_breakdown', 'calculate_four_d_payout_results'
  ] loop
    definition := pg_get_functiondef(('public.' || function_name || '(uuid)')::regprocedure);
    definition := replace(definition,
      'public.has_organization_access(payout_plan.producer_id)',
      '(public.has_organization_access(payout_plan.producer_id) or public.is_payout_plan_public(target_plan_id))');
    definition := replace(definition,
      'public.has_organization_access(plan_record.producer_id)',
      '(public.has_organization_access(plan_record.producer_id) or public.is_payout_plan_public(target_plan_id))');
    execute definition;
  end loop;
end;
$$;

create function public.public_event_money_results(target_event_id uuid)
returns table (
  event_roping_id uuid, plan_id uuid, pool_name text, pool_type text,
  section_type text, round_number integer, d_number integer,
  place_number integer, entry_id uuid, roper_id uuid, contestant_name text,
  performance_seconds numeric, payout_cents bigint
)
language sql stable security definer set search_path = '' as $$
  with plans as (
    select plan.*, roping.competition_format
    from public.event_roping_payout_plans plan
    join public.event_ropings roping on roping.id = plan.event_roping_id
    where plan.event_id = target_event_id and public.is_payout_plan_public(plan.id)
  ), awards as (
    select plan.event_roping_id, plan.id, plan.name, plan.pool_type::text,
      result.section_type, result.round_number, null::integer as d_number,
      result.place_number, result.entry_id, result.contestant_name,
      result.performance_seconds, result.payout_cents
    from plans plan
    cross join lateral public.calculate_roping_payout_results(plan.id) result
    where not (plan.competition_format = 'four_d' and plan.pool_type = 'main')
    union all
    select plan.event_roping_id, plan.id, plan.name, plan.pool_type::text,
      'four_d', 1, result.d_number, result.place_number, result.entry_id,
      result.contestant_name, result.performance_seconds, result.payout_cents
    from plans plan
    cross join lateral public.calculate_four_d_payout_results(plan.id) result
    where plan.competition_format = 'four_d' and plan.pool_type = 'main'
  )
  select award.event_roping_id, award.id, award.name, award.pool_type,
    award.section_type, award.round_number, award.d_number,
    award.place_number, award.entry_id, entry.roper_id, award.contestant_name,
    award.performance_seconds, award.payout_cents
  from awards award join public.roping_entries entry on entry.id = award.entry_id
  where award.payout_cents > 0;
$$;
revoke all on function public.public_event_money_results(uuid) from public;
grant execute on function public.public_event_money_results(uuid) to anon, authenticated;

do $$
declare definition text;
begin
  definition := pg_get_viewdef('public.public_event_live_results'::regclass, true);
  if position('entry.handicap_time_credit_seconds' || chr(10) || '   FROM' in definition) = 0 then
    raise exception 'Public live result view does not match the expected entry projection';
  end if;
  definition := replace(definition,
    'entry.handicap_time_credit_seconds' || chr(10) || '   FROM',
    'entry.handicap_time_credit_seconds, entry.id AS entry_id' || chr(10) || '   FROM');
  execute 'create or replace view public.public_event_live_results as ' || definition;
end;
$$;

-- A rerun is unresolved and must not become an official result.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.finalize_roping_results(uuid)'::regprocedure);
  definition := replace(definition, 'run.status = ''pending''', 'run.status in (''pending'', ''rerun'')');
  definition := replace(definition,
    'Every scheduled run must be completed, scratched, or marked no-time before finalizing',
    'Resolve every scheduled run, including reruns, before marking results official');
  execute definition;
end;
$$;
