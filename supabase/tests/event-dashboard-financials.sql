begin;
do $$
declare actor uuid; event record; plan record; awarded bigint; collected bigint; outstanding bigint;
begin
  select user_id into actor from public.producer_staff where producer_id='8f96f20f-932b-45ae-ac93-9832818de64d' and role='owner' limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  for event in select id,slug from public.events where producer_id='8f96f20f-932b-45ae-ac93-9832818de64d'
    and slug in ('test-suite-v2-weekend-1','test-suite-v2-weekend-2','test-suite-v2-live','test-suite-v2-upcoming') loop
    select coalesce(sum(collected_cents),0),coalesce(sum(outstanding_cents),0) into collected,outstanding
      from public.event_fee_collection_summary(event.id);
    if collected<0 or outstanding<0 then raise exception 'Invalid fee collection totals for %',event.slug; end if;
    awarded:=0;
    for plan in select payout.id,payout.pool_type,roping.competition_format from public.event_roping_payout_plans payout
      join public.event_ropings roping on roping.id=payout.event_roping_id where payout.event_id=event.id loop
      if plan.competition_format='four_d' and plan.pool_type='main' then
        awarded:=awarded+(select coalesce(sum(payout_cents),0) from public.calculate_four_d_payout_results(plan.id));
      else
        awarded:=awarded+(select coalesce(sum(payout_cents),0) from public.calculate_roping_payout_results(plan.id));
      end if;
    end loop;
    if awarded<0 then raise exception 'Invalid payout total for %',event.slug; end if;
    if event.slug='test-suite-v2-upcoming' and awarded<>0 then raise exception 'Upcoming event has unearned awards'; end if;
    if event.slug in ('test-suite-v2-weekend-1','test-suite-v2-weekend-2') and awarded=0 then raise exception 'Completed event awards missing'; end if;
  end loop;
end;
$$;
select 'Completed, live and upcoming event fee/payout summary queries passed' result;
rollback;
