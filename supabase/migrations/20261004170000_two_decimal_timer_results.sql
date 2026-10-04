-- Round resolved timer readings before they reach standings and payouts.
do $$
declare
  routine record;
  definition text;
begin
  for routine in
    select p.oid from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('record_run_result_multi', 'correct_run_result_multi')
      and p.prokind = 'f'
  loop
    definition := pg_get_functiondef(routine.oid);
    definition := replace(definition, 'resolved_time numeric(8, 3)', 'resolved_time numeric(8, 2)');
    definition := replace(definition, 'round(avg(reading), 3)', 'round(avg(reading), 2)');
    definition := replace(definition, 'coalesce(entered_penalty, 0)', 'round(coalesce(entered_penalty, 0), 2)');
    execute definition;
  end loop;
end;
$$;
