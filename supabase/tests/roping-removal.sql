-- Roll back every deletion, including all trigger/audit effects.
begin;
do $$
declare target uuid; event uuid; before_siblings jsonb; after_siblings jsonb;
begin
  select r.id,r.event_id into target,event from public.event_ropings r
    where r.event_day_status='scheduled'
      and exists(select 1 from public.event_fees f where f.event_roping_id=r.id)
      and not exists(select 1 from public.competition_runs c where c.event_roping_id=r.id and c.recorded_at is not null)
      and not exists(select 1 from public.fund_transactions f where f.event_roping_id=r.id)
      and not exists(select 1 from public.roping_entries e where e.event_roping_id=r.id)
      and (select count(*) from public.event_ropings s where s.event_id=r.event_id)>1
    limit 1;
  if target is null then raise exception 'An unstarted roping with fees is required'; end if;
  select jsonb_agg(to_jsonb(r) order by r.id) into before_siblings
    from public.event_ropings r where r.event_id=event and r.id<>target;
  delete from public.event_ropings where id=target;
  if exists(select 1 from public.event_fees where event_roping_id=target)
    or exists(select 1 from public.competition_runs where event_roping_id=target)
    or exists(select 1 from public.roping_entries where event_roping_id=target) then
    raise exception 'Roping child records were not removed';
  end if;
  select jsonb_agg(to_jsonb(r) order by r.id) into after_siblings
    from public.event_ropings r where r.event_id=event and r.id<>target;
  if before_siblings is distinct from after_siblings then raise exception 'Other ropings were changed'; end if;
end $$;
rollback;
