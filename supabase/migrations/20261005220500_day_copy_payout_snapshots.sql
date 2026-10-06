-- Fee insertion creates default payout plans. Replace those with the source
-- day's saved plans rather than inserting a second plan for the same fee.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.copy_event_day_schedule(uuid,date,date)'::regprocedure) into definition;
  definition := replace(definition,
    '    for plan in select * from public.event_roping_payout_plans where event_roping_id=r.id loop',
    '    delete from public.event_roping_payout_plans where event_roping_id=roping_id;
    for plan in select * from public.event_roping_payout_plans where event_roping_id=r.id loop');
  execute definition;
end;
$$;
