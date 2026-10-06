alter table public.producers add column standings_cap_carryover boolean not null default false;

create function public.public_season_standings_source(target_producer_slug text, target_season_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
with producer as (
  select p.* from public.producers p where p.slug = target_producer_slug
), season as (
  select s.* from public.producer_seasons s join producer p on p.id=s.producer_id
  where s.id=target_season_id
), ropings as materialized (
  select r.*, case when r.competition_format in ('handicap','four_d')
    then r.division_id::text || ':' || r.competition_format else r.classification_id::text end as standing_class
  from public.event_ropings r join public.events e on e.id=r.event_id
  join season s on s.producer_id=r.producer_id
  where e.is_public and e.status <> 'cancelled' and r.result_status='official'
    and r.scheduled_date between s.starts_on and s.ends_on
), awards as materialized (
  select a.* from (select distinct event_id from ropings) e
  cross join lateral public.public_event_money_results(e.event_id) a
), entrants as materialized (
  select r.standing_class, r.scheduled_date, r.division_id, r.competition_format,
    e.*, concat_ws(' ', person.first_name,person.last_name) as contestant_name,
    m.profile_fields->>'city' as city, m.profile_fields->>'state' as state,
    c.name as handicap_name
  from ropings r join public.roping_entries e on e.event_roping_id=r.id
  join public.ropers person on person.id=e.roper_id
  left join public.memberships m on m.id=e.membership_id
  left join public.classifications c on c.id=e.handicap_classification_id
  where e.competition_status='active' and r.standing_class is not null
), contributions as (
  select e.roper_id,e.standing_class,e.event_roping_id,e.scheduled_date,
    coalesce(sum(a.payout_cents),0)::bigint as cents
  from entrants e left join awards a on a.entry_id=e.id and a.event_roping_id=e.event_roping_id
  group by e.roper_id,e.standing_class,e.event_roping_id,e.scheduled_date
), classes as (
  select c.id::text as id,c.name,d.name as division_name,c.division_id,c.rank as number
  from public.classifications c join producer p on p.id=c.producer_id
  join public.divisions d on d.id=c.division_id where c.standalone_enabled
  union all
  select distinct r.standing_class,case r.competition_format when 'handicap' then 'Handicap' else '4-D' end,
    d.name,r.division_id,0 from ropings r join public.divisions d on d.id=r.division_id
  where r.competition_format in ('handicap','four_d')
), moves as (
  select h.id,m.roper_id,old.classification_id as from_id,h.classification_id as to_id,h.effective_on,
    p.standings_cap_carryover,
    (select jsonb_agg(c.id::text order by c.rank desc,c.id) from public.classifications c
      where c.producer_id=p.id and c.division_id=h.division_id and c.rank>0 and c.standalone_enabled) as ladder
  from public.membership_classification_history h
  join public.membership_classification_history old on old.id=h.previous_assignment_id
  join public.memberships m on m.id=h.membership_id
  join producer p on p.id=h.producer_id join season s on s.producer_id=p.id
  join public.classifications source on source.id=old.classification_id
  join public.classifications destination on destination.id=h.classification_id
  where h.effective_on between s.starts_on and s.ends_on
    and source.rank>0 and destination.rank>0 and source.id<>destination.id
    and exists(select 1 from entrants e where e.roper_id=m.roper_id)
)
select jsonb_build_object(
  'contributions',coalesce((select jsonb_agg(jsonb_build_object('roperId',roper_id,'classId',standing_class,
    'ropingId',event_roping_id,'date',scheduled_date,'official',true,'winningsCents',cents)) from contributions),'[]'::jsonb),
  'classes',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'divisionName',division_name)
    order by division_name,number desc,name) from classes),'[]'::jsonb),
  'ropers',coalesce((select jsonb_agg(to_jsonb(person)) from (
    select distinct on (roper_id,standing_class) roper_id as "roperId",standing_class as "classId",
      contestant_name as name,city,state,handicap_name as handicap,
      handicap_time_credit_seconds as "handicapSeconds"
    from entrants order by roper_id,standing_class,scheduled_date desc,entered_at desc
  ) person),'[]'::jsonb),
  'moves',coalesce((select jsonb_agg(jsonb_build_object('id',id,'roperId',roper_id,'fromClassId',from_id,
    'toClassId',to_id,'date',effective_on,'capAtLeader',standings_cap_carryover,'classLadder',ladder)
    order by effective_on,id) from moves),'[]'::jsonb)
);
$$;
revoke all on function public.public_season_standings_source(text,uuid) from public;
grant execute on function public.public_season_standings_source(text,uuid) to anon,authenticated;
