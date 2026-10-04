-- Main plans have no optional fee, so fee_kind is NULL. NULL must not
-- suppress main winners before insurance eligibility is evaluated.
do $$
declare
  definition text;
begin
  definition := pg_get_functiondef('public.calculate_roping_payout_results(uuid)'::regprocedure);
  definition := replace(definition,
    'plan.fee_kind = ''insurance''',
    'coalesce(plan.fee_kind = ''insurance'', false)');
  execute definition;
end;
$$;
