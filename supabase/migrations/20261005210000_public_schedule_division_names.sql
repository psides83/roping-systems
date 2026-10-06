-- Extend the existing published-event projection without changing its visibility filters.
do $$
declare definition text;
begin
  definition:=rtrim(pg_get_viewdef('public.public_event_entry_options'::regclass,true),E';\n ');
  execute 'create or replace view public.public_event_entry_options with (security_invoker=false) as
    select schedule.*, division.name as division_name from ('||definition||') schedule
    join public.event_ropings roping on roping.id=schedule.event_roping_id
    join public.divisions division on division.id=roping.division_id';
end;
$$;
