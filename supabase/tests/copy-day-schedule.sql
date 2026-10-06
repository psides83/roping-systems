-- Uses an unstarted sample event; all fixture changes are rolled back.
begin;
do $$
declare event uuid; source_day date; target_day date; manager uuid; copied integer;
  source_count integer; source_fees bigint; target_fees bigint; zone text; denied boolean;
begin
  select e.id, s.user_id, p.timezone into event,manager,zone
    from public.events e join public.producer_staff s on s.producer_id=e.producer_id and s.role='owner'
    join public.producers p on p.id=e.producer_id
    where e.status not in ('in_progress','completed','cancelled')
      and exists(select 1 from public.event_ropings r where r.event_id=e.id)
    order by e.created_at desc limit 1;
  if event is null then raise exception 'An unstarted event with ropings is required'; end if;
  perform set_config('request.jwt.claim.sub',manager::text,true);
  select min(scheduled_date),max(scheduled_date)+1 into source_day,target_day
    from public.event_ropings where event_id=event;
  update public.events set ends_at=(target_day+time '23:00') at time zone zone where id=event;
  select count(*) into source_count from public.event_ropings where event_id=event and scheduled_date=source_day;
  select sum(f.amount_cents) into source_fees from public.event_fees f join public.event_ropings r on r.id=f.event_roping_id
    where r.event_id=event and r.scheduled_date=source_day;
  copied:=public.copy_event_day_schedule(event,source_day,target_day);
  if copied<>source_count then raise exception 'Not all source ropings were copied'; end if;
  select sum(f.amount_cents) into target_fees from public.event_fees f join public.event_ropings r on r.id=f.event_roping_id
    where r.event_id=event and r.scheduled_date=target_day;
  if source_fees is distinct from target_fees then raise exception 'Copied fees do not match'; end if;
  if exists(select 1 from public.roping_entries e join public.event_ropings r on r.id=e.event_roping_id where r.event_id=event and r.scheduled_date=target_day)
    or exists(select 1 from public.competition_runs c join public.event_ropings r on r.id=c.event_roping_id where r.event_id=event and r.scheduled_date=target_day)
    or exists(select 1 from public.roping_funding f join public.event_ropings r on r.id=f.event_roping_id where r.event_id=event and r.scheduled_date=target_day) then
    raise exception 'Competition or funding records were copied';
  end if;
  denied:=false;
  begin perform public.copy_event_day_schedule(event,source_day,target_day);
    exception when others then denied:=true;
  end;
  if not denied then raise exception 'Copying onto an occupied day was allowed'; end if;
  denied:=false;
  perform set_config('request.jwt.claim.sub','',true);
  begin perform public.copy_event_day_schedule(event,source_day,target_day+1);
    exception when others then denied:=true;
  end;
  if not denied then raise exception 'Unauthenticated copying was allowed'; end if;
end $$;
rollback;
