begin;
create temporary table public_history_checks (result text);
do $$
declare
  fixture uuid;
  roping_count integer;
begin
  select id into strict fixture from public.events where slug = 'test-suite-v1-weekend-2' and publication_state = 'unpublished';
  if exists(select 1 from public.public_event_schedule where id = fixture) then raise exception 'Unpublished event leaked into public schedule'; end if;
  insert into public_history_checks values ('PASS: unpublished completed event stays private');
  update public.events set publication_state = 'published' where id = fixture;
  if not exists(select 1 from public.public_event_schedule where id = fixture and status = 'completed') then raise exception 'Published completed event is missing'; end if;
  select count(distinct event_roping_id) into roping_count from public.public_aggregate_results where event_slug = 'test-suite-v1-weekend-2';
  if roping_count < 4 then raise exception 'Completed results missing across roping formats'; end if;
  if not exists(select 1 from public.public_event_live_results where event_slug = 'test-suite-v1-weekend-2' and status = 'complete') then raise exception 'Completed round times are missing'; end if;
  insert into public_history_checks values ('PASS: published completed event exposes aggregate and round results');
end;
$$;
select * from public_history_checks;
rollback;
