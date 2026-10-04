do $$
declare
  definition text;
begin
  definition := pg_get_viewdef('public.public_competition_formats'::regclass, true);
  definition := replace(definition, 'division.competition_format',
    'division.competition_format, division.short_round_enabled');
  execute 'create or replace view public.public_competition_formats as ' || definition;

  definition := pg_get_viewdef('public.public_event_live_results'::regclass, true);
  definition := regexp_replace(definition, ';\s*$',
    ' AND entry.competition_status = ''active'' AND NOT run.is_excluded;');
  execute 'create or replace view public.public_event_live_results as ' || definition;
end;
$$;
