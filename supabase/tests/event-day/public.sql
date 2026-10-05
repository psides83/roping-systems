create temporary table public_test_events on commit drop as
  select id,status,slug from public.events where id in(select distinct event_id from test_ropings)
    or id in(select id from test_public_future_events);
grant select on public_test_events to anon;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $$
declare e record;
begin
  for e in select * from public_test_events loop
    if not exists(select 1 from public.public_event_schedule where id=e.id) then raise exception 'Public schedule omitted a test event'; end if;
    if not exists(select 1 from public.public_event_entry_options where event_id=e.id) then raise exception 'Public schedule omitted test ropings'; end if;
    if e.status='completed' and not exists(select 1 from public.public_event_money_results(e.id) where pool_type='main' and payout_cents>0) then
      raise exception 'Public main winnings are missing'; end if;
    if e.status='completed' and not exists(select 1 from public.public_event_money_results(e.id) where pool_type<>'main' and payout_cents>0) then
      raise exception 'Public side-pot winnings are missing'; end if;
  end loop;
end $$;
reset role;
insert into test_report(scenario,detail) values('Anonymous public schedule and winnings',jsonb_build_object('events',(select count(*) from public_test_events),'passed',true));
insert into test_report(scenario,detail) values('Assertion summary',jsonb_build_object(
  'passedChecks',coalesce(nullif(current_setting('test.check_count',true),''),'0')::integer,
  'templates',(select count(distinct template_id) from test_ropings),
  'completedRopings',(select count(*) from test_ropings)));
