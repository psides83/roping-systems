-- Refresh only the two retained fixture events; never use this on real competition data.
begin;
set local statement_timeout = '180s';
create temporary table fixture_events on commit drop as
select * from public.events where producer_id = '8f96f20f-932b-45ae-ac93-9832818de64d'
and slug in ('test-suite-v1-weekend-1', 'test-suite-v1-weekend-2');
select set_config('request.jwt.claim.sub', (select user_id::text from public.producer_staff
where producer_id = '8f96f20f-932b-45ae-ac93-9832818de64d' and role = 'owner'
order by created_at limit 1), true);
create temporary table original_runs on commit drop as
select run.* from public.competition_runs run join public.event_ropings r on r.id = run.event_roping_id
where r.event_id in (select id from fixture_events);
create temporary table time_report (stage text, complete_runs integer, tied_round_times integer) on commit drop;
insert into time_report select 'Before', count(*)::integer,
count(*)::integer - count(distinct (run.event_roping_id, run.round_number,
run.raw_time_seconds + run.penalty_seconds - entry.handicap_time_credit_seconds))::integer
from original_runs run join public.roping_entries entry on entry.id = run.entry_id
where run.status = 'complete' and not run.is_excluded;

create function pg_temp.fixture_noise(seed text) returns numeric language sql immutable as $$
select (('x' || substr(md5(seed), 1, 8))::bit(32)::bigint % 10000)::numeric / 10000;
$$;

do $$
declare
  run record;
  candidate numeric;
  final_seconds numeric;
  readings numeric[];
  seen jsonb := '{}';
  bucket text;
  finalist boolean;
begin
  if (select count(*) from fixture_events) <> 2 then raise exception 'Expected exactly two retained test events'; end if;
  if exists (select 1 from public.payout_disbursements where event_id in (select id from fixture_events)) then
    raise exception 'Paid awards exist: do not change these fixtures without review';
  end if;
  update public.events set status = 'in_progress', result_status = 'unofficial'
  where id in (select id from fixture_events);
  for run in
    select c.*, r.timer_count, r.timer_resolution, r.main_round_count, r.short_round_enabled,
      d.name division_name, cl.name class_name, entry.handicap_time_credit_seconds offset_seconds
    from original_runs c join public.event_ropings r on r.id = c.event_roping_id
    join public.divisions d on d.id = r.division_id
    left join public.classifications cl on cl.id = r.classification_id
    join public.roping_entries entry on entry.id = c.entry_id
    where c.status = 'complete' and not c.is_excluded
    order by c.event_roping_id, c.round_number, c.id
  loop
    finalist := exists (select 1 from original_runs s where s.entry_id = run.entry_id
      and s.round_number > run.main_round_count);
    -- Preserve the completed short-round field by keeping its qualifiers ahead in the main aggregate.
    candidate := case when run.division_name ilike '%breakaway%' then
      2.05 + 2.1 * pg_temp.fixture_noise(run.entry_id::text)
        + 1.3 * pg_temp.fixture_noise(run.id::text)
      when run.short_round_enabled and run.round_number <= run.main_round_count then
        case when finalist then 10.5 + 1.4 * pg_temp.fixture_noise(run.id::text)
          else 13.5 + 7 * pg_temp.fixture_noise(run.id::text) end
      else (case when run.class_name = 'Open' then 8.1 else 10.5 end)
        + 5 * pg_temp.fixture_noise(run.entry_id::text) + 3.5 * pg_temp.fixture_noise(run.id::text)
      end;
    candidate := round(candidate, 2);
    bucket := run.event_roping_id::text || ':' || run.round_number;
    final_seconds := candidate + run.penalty_seconds - run.offset_seconds;
    while coalesce(seen -> bucket, '[]'::jsonb) @> to_jsonb(array[final_seconds]) loop
      candidate := candidate + 0.01;
      final_seconds := final_seconds + 0.01;
    end loop;
    seen := jsonb_set(seen, array[bucket], coalesce(seen -> bucket, '[]'::jsonb) || to_jsonb(final_seconds));
    readings := array_fill(candidate, array[run.timer_count]);
    -- Distinct timer readings retain the same official result under each resolution method.
    if run.timer_count > 1 then
      if run.timer_resolution = 'best' then readings[2] := candidate + 0.02;
      elsif run.timer_resolution = 'longest' then readings[2] := candidate - 0.02;
      else readings[1] := candidate - 0.01; readings[2] := candidate + 0.01;
      end if;
    end if;
    perform public.correct_run_result_multi(run.id, readings, run.penalty_seconds, run.status,
      'Refresh retained test fixture with realistic varied times');
  end loop;
  if exists (select 1 from original_runs old join public.competition_runs current on current.id = old.id
    where old.status <> current.status or old.penalty_seconds <> current.penalty_seconds
      or old.draw_position is distinct from current.draw_position) then
    raise exception 'Run outcomes, penalties or draws changed unexpectedly';
  end if;
  update public.events e set status = original.status, result_status = original.result_status
  from fixture_events original where e.id = original.id;
end;
$$;

insert into time_report select 'After', count(*)::integer,
count(*)::integer - count(distinct (run.event_roping_id, run.round_number,
run.raw_time_seconds + run.penalty_seconds - entry.handicap_time_credit_seconds))::integer
from public.competition_runs run join original_runs old on old.id = run.id
join public.roping_entries entry on entry.id = run.entry_id
where run.status = 'complete' and not run.is_excluded;
create temporary table refreshed_aggregates on commit drop as
select run.event_roping_id, run.entry_id,
sum(run.raw_time_seconds + run.penalty_seconds - entry.handicap_time_credit_seconds) seconds,
exists (select 1 from original_runs s where s.entry_id = run.entry_id and s.round_number > r.main_round_count) finalist
from public.competition_runs run join original_runs old on old.id = run.id
join public.event_ropings r on r.id = run.event_roping_id
join public.roping_entries entry on entry.id = run.entry_id
where run.round_number <= r.main_round_count and not run.is_excluded
group by run.event_roping_id, run.entry_id, r.main_round_count
having bool_and(run.status = 'complete') and count(*) = r.main_round_count;
do $$
begin
  if exists (select 1 from refreshed_aggregates finalist join refreshed_aggregates other
    on other.event_roping_id = finalist.event_roping_id
    where finalist.finalist and not other.finalist and other.seconds < finalist.seconds) then
    raise exception 'A retained short-round qualifier is no longer in the top aggregate';
  end if;
end;
$$;
select jsonb_build_object('rounds',(select jsonb_agg(to_jsonb(report)) from time_report report),
  'aggregate_ties',(select count(*) - count(distinct (event_roping_id, seconds)) from refreshed_aggregates)) report;
rollback;
