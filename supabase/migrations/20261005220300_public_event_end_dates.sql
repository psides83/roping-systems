-- Keep the existing public visibility filters; expose only the event's end date.
do $$
declare definition text;
begin
  if not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='public_event_schedule' and column_name='ends_at') then
    definition := rtrim(pg_get_viewdef('public.public_event_schedule'::regclass,true),E';\n ');
    execute 'create or replace view public.public_event_schedule with (security_invoker=false) as
      select schedule.*, event.ends_at from ('||definition||') schedule
      join public.events event on event.id=schedule.id';
  end if;
end;
$$;
