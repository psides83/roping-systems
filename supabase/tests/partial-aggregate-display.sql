begin;
create temporary table expected_partial_totals on commit drop as
select entry.id,roping.main_round_count,count(*) filter(where run.status='complete') qualified_count,
sum(greatest(run.raw_time_seconds+run.penalty_seconds-entry.handicap_time_credit_seconds,0))
  filter(where run.status='complete') expected_total
from public.roping_entries entry join public.event_ropings roping on roping.id=entry.event_roping_id
join public.events event on event.id=roping.event_id
join public.competition_runs run on run.entry_id=entry.id and run.round_number<=roping.main_round_count and not run.is_excluded
where event.slug in ('test-suite-v1-weekend-1','test-suite-v1-weekend-2')
  and event.publication_state='published' and entry.competition_status='active'
group by entry.id,roping.main_round_count
having count(*) filter(where run.status='complete') between 1 and roping.main_round_count-1;
do $$
begin
  if not exists(select 1 from expected_partial_totals) then raise exception 'No partial aggregate fixtures found'; end if;
  if exists(select 1 from expected_partial_totals expected left join public.public_aggregate_results actual on actual.result_id=expected.id
    where actual.result_id is null or actual.main_aggregate_seconds is distinct from expected.expected_total
      or actual.main_rounds_completed<>expected.qualified_count or actual.status='complete') then
    raise exception 'Partial aggregate totals or qualification status are incorrect';
  end if;
end;
$$;
grant select on expected_partial_totals to anon;
set local role anon;
do $$
begin
  if exists(select 1 from expected_partial_totals expected left join public.public_aggregate_results actual on actual.result_id=expected.id
    where actual.result_id is null or actual.main_aggregate_seconds is distinct from expected.expected_total) then
    raise exception 'Public visitors cannot read the partial aggregate totals';
  end if;
end;
$$;
reset role;
select count(*) verified_partial_aggregates from expected_partial_totals;
rollback;
