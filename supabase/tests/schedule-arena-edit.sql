begin;
select set_config('request.jwt.claim.sub', '2d940f25-84d8-4eb1-a260-2bb76717cfda', true);
do $$
declare
  roping public.event_ropings%rowtype;
begin
  select r.* into strict roping from public.event_ropings r
  join public.events e on e.id = r.event_id
  where e.id = '0405a4f6-bdf6-49d6-af75-7f665006308b'
  order by r.sort_order limit 1;
  perform public.save_roping_schedule(roping.id, roping.scheduled_date,
    'fixed', roping.scheduled_date + time '09:00', 'Arena edit regression', 'First Available');
  if not exists (select 1 from public.event_ropings where id = roping.id
    and arena_name = 'First Available' and schedule_note = 'Arena edit regression') then
    raise exception 'Arena and schedule did not save together';
  end if;
  begin
    perform public.save_roping_schedule(roping.id, roping.scheduled_date,
      'fixed', roping.scheduled_date + time '09:00', null, 'Arena 999');
    raise exception 'Invalid arena was accepted';
  exception when others then
    if sqlerrm = 'Invalid arena was accepted' then raise; end if;
  end;
  begin
    perform public.save_roping_schedule(roping.id, roping.scheduled_date,
      'follows_previous', null, null, 'First Available');
    raise exception 'Missing predecessor was accepted';
  exception when others then
    if sqlerrm = 'Missing predecessor was accepted' then raise; end if;
  end;
end;
$$;
rollback;
