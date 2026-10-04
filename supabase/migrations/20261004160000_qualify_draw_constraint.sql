-- These security-definer routines deliberately use an empty search path.
-- Constraint lookup must therefore include the owning schema.
do $$
declare
  routine record;
  definition text;
begin
  for routine in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'generate_division_draw',
        'set_division_draw_order',
        'manage_short_round_qualifier',
        'schedule_run_rerun'
      )
  loop
    definition := pg_get_functiondef(routine.oid);
    definition := replace(
      definition,
      'set constraints runs_roping_division_id_run_number_draw_position_key deferred;',
      'set constraints public.runs_roping_division_id_run_number_draw_position_key deferred;'
    );
    execute definition;
  end loop;
end;
$$;
