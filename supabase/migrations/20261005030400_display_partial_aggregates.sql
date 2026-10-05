-- Partial totals are for display only. Payout qualification remains in the scoring functions.
create or replace view public.public_aggregate_results with (security_invoker=false) as
select entry.id as result_id, event.producer_id, producer.slug as producer_slug,
  event.slug as event_slug,event.title as event_title,roping.id as event_roping_id,
  roping.name as event_roping_name,roping.result_status,entry.entry_number,roper.first_name,roper.last_name,
  roping.main_round_count,main.completed_count as main_rounds_completed,
  main.aggregate_seconds as main_aggregate_seconds,
  short_run.id is not null as is_short_round_qualifier,short_run.status as short_round_status,
  case when short_run.status='complete' then greatest(short_run.raw_time_seconds+short_run.penalty_seconds-entry.handicap_time_credit_seconds,0)
    else null end as short_round_time_seconds,
  case when short_run.status='complete' then coalesce(main.aggregate_seconds,0)+greatest(short_run.raw_time_seconds+short_run.penalty_seconds-entry.handicap_time_credit_seconds,0)
    else main.aggregate_seconds end as aggregate_time_seconds,
  case when main.failed then 'no_time'
    when short_run.status in ('no_time','scratch','turned_out','disqualified') then short_run.status::text
    when main.completed_count=roping.main_round_count then 'complete' else 'pending' end as status,
  entry.handicap_time_credit_seconds
from public.roping_entries entry join public.ropers roper on roper.id=entry.roper_id
join public.event_ropings roping on roping.id=entry.event_roping_id
join public.events event on event.id=roping.event_id join public.producers producer on producer.id=event.producer_id
cross join lateral (
  select count(*) filter(where run.status='complete')::integer completed_count,
    bool_or(run.status in ('no_time','scratch','turned_out','disqualified')) failed,
    sum(greatest(run.raw_time_seconds+run.penalty_seconds-entry.handicap_time_credit_seconds,0))
      filter(where run.status='complete') aggregate_seconds,
    count(*) filter(where run.status<>'pending')::integer started_count
  from public.competition_runs run where run.entry_id=entry.id and run.round_number<=roping.main_round_count and not run.is_excluded
) main
left join public.competition_runs short_run on short_run.entry_id=entry.id
  and short_run.round_number=roping.main_round_count+1 and not short_run.is_excluded
where event.publication_state='published' and entry.competition_status='active' and main.started_count>0;
