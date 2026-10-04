-- Publication state is the authority for all public event data.
do $$
declare
  view_record record;
  routine record;
  definition text;
begin
  for view_record in
    select v.viewname, v.definition from pg_views v
    where schemaname = 'public'
      and viewname in (
        'public_competition_formats', 'public_event_optional_fees',
        'public_event_entry_options', 'public_aggregate_results',
        'public_event_live_results'
      )
  loop
    definition := replace(
      view_record.definition, 'roping.is_public = true',
      'roping.publication_state = ''published'''
    );
    execute format('create or replace view public.%I as %s', view_record.viewname, definition);
  end loop;

  for routine in
    select oid from pg_proc
    where pronamespace = 'public'::regnamespace and prokind = 'f'
      and proname in ('calculate_four_d_results', 'submit_online_entry_request')
  loop
    definition := pg_get_functiondef(routine.oid);
    definition := replace(definition,
      'select roping.is_public into roping_is_public',
      'select roping.publication_state = ''published'' into roping_is_public');
    definition := replace(definition, 'and is_public = true',
      'and publication_state = ''published''');
    execute definition;
  end loop;
end;
$$;

alter policy "Public can receive runs for published ropings"
on public.competition_runs
using (
  exists (
    select 1 from public.event_ropings division
    join public.events event on event.id = division.event_id
    where division.id = competition_runs.event_roping_id
      and event.publication_state = 'published'
  )
);
