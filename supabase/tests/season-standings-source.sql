begin;
do $$
declare
  season_id uuid;
  payload jsonb;
  expected bigint;
  actual bigint;
begin
  select s.id into strict season_id from public.producer_seasons s
  join public.producers p on p.id=s.producer_id where p.slug='ultimate-calf-roping'
  order by s.starts_on desc limit 1;
  payload := public.public_season_standings_source('ultimate-calf-roping',season_id);
  if jsonb_array_length(payload->'contributions')=0 then raise exception 'Expected retained official entries'; end if;
  if payload::text ~ '"(email|phone|birth_date|reason|auth_user_id)"' then
    raise exception 'Private profile fields exposed';
  end if;
  select coalesce(sum(a.payout_cents),0) into actual
  from (select distinct row->>'eventId' as id from jsonb_array_elements(payload->'contributions') row) event
  cross join lateral public.public_event_money_results(event.id::uuid) a
  where exists(select 1 from jsonb_array_elements(payload->'contributions') row
    where row->'entryIds' ? a.entry_id::text);
  select coalesce(sum(a.payout_cents),0) into expected
  from public.events e join public.producer_seasons s on s.producer_id=e.producer_id and s.id=season_id
  cross join lateral public.public_event_money_results(e.id) a
  join public.event_ropings r on r.id=a.event_roping_id
  join public.roping_entries entry on entry.id=a.entry_id
  where e.is_public and e.status<>'cancelled' and r.result_status='official'
    and r.scheduled_date between s.starts_on and s.ends_on
    and entry.competition_status='active';
  if actual<>expected then raise exception 'Standings winnings differ from official payouts: % versus %',actual,expected; end if;
  if exists (select 1 from jsonb_array_elements(payload->'contributions') row
    group by row->>'roperId',row->>'classId',row->>'ropingId' having count(*)>1) then
    raise exception 'Duplicate attendance records';
  end if;
  payload := public.public_season_standings_source('nonexistent-producer',season_id);
  if jsonb_array_length(payload->'contributions')<>0 then raise exception 'Cross-producer data exposed'; end if;
end;
$$;
rollback;
