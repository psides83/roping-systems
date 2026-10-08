-- Private copies reuse the established payout rules without granting access to
-- the full competitor field. Keep these paired with future payout-engine changes.
do $$
declare fn text; dependency text; definition text; revised text;
begin
  foreach fn in array array['calculate_roping_payouts','calculate_roping_payout_results','calculate_four_d_payout_breakdown','calculate_four_d_payout_results'] loop
    definition:=pg_get_functiondef(('public.'||fn||'(uuid)')::regprocedure);
    revised:=replace(definition,'public.has_organization_access(payout_plan.producer_id)','true');
    revised:=replace(revised,'public.has_organization_access(plan_record.producer_id)','true');
    if revised=definition then raise exception 'Missing payout ownership guard for %',fn; end if;
    foreach dependency in array array['calculate_roping_payouts','calculate_roping_payout_results','calculate_four_d_payout_breakdown','calculate_four_d_payout_results'] loop
      revised:=replace(revised,'public.'||dependency||'(', 'public.portal_internal_'||dependency||'(');
    end loop;
    execute revised;
    execute 'revoke all on function public.portal_internal_'||fn||'(uuid) from public,anon,authenticated';
  end loop;
end;
$$;

create function public.my_roper_results(target_membership_id uuid, target_season_id uuid default null, page_number integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare member public.memberships%rowtype; result jsonb;
begin
  if not public.owns_membership(target_membership_id) then raise exception 'This membership is not linked to your account'; end if;
  select * into member from public.memberships where id=target_membership_id;
  if page_number is null or page_number<1 or page_number>10000 then raise exception 'Choose a valid results page'; end if;
  if target_season_id is not null and not exists(select 1 from public.producer_seasons where id=target_season_id and producer_id=member.producer_id) then raise exception 'Choose a season belonging to this producer'; end if;
  with eligible as materialized (
    select e.id,e.entry_number,e.competition_status,r.id as roping_id,r.name,r.scheduled_date,r.main_round_count,
      r.result_status,r.competition_format,v.title,v.slug,v.publication_state,d.name as division
    from public.roping_entries e join public.event_ropings r on r.id=e.event_roping_id and r.producer_id=member.producer_id
    join public.events v on v.id=e.event_id and v.producer_id=member.producer_id
    left join public.divisions d on d.id=r.division_id
    where e.roper_id=member.roper_id and e.producer_id=member.producer_id
      and (r.event_day_status='completed' or exists(select 1 from public.competition_runs run where run.entry_id=e.id and run.status<>'pending' and not run.is_excluded))
      and (target_season_id is null or exists(select 1 from public.producer_seasons s where s.id=target_season_id and r.scheduled_date between s.starts_on and s.ends_on))
  ), selected as materialized (
    select * from eligible order by scheduled_date desc,roping_id,id limit 25 offset (page_number-1)*25
  ), plans as materialized (
    select p.*,r.competition_format from public.event_roping_payout_plans p
    join (select distinct roping_id,competition_format from selected) r on r.roping_id=p.event_roping_id
    where p.producer_id=member.producer_id
  ), awards as materialized (
    select p.id as plan_id,p.event_roping_id,p.name as pool_name,p.pool_type::text,a.section_type,a.round_number,
      null::integer as d_number,a.place_number,a.entry_id,a.performance_seconds,a.payout_cents
    from plans p cross join lateral public.portal_internal_calculate_roping_payout_results(p.id) a
    where not(p.competition_format='four_d' and p.pool_type='main')
    union all
    select p.id,p.event_roping_id,p.name,p.pool_type::text,'four_d',1,a.d_number,a.place_number,a.entry_id,a.performance_seconds,a.payout_cents
    from plans p cross join lateral public.portal_internal_calculate_four_d_payout_results(p.id) a
    where p.competition_format='four_d' and p.pool_type='main'
  )
  select jsonb_build_object('total',(select count(*) from eligible),'page',page_number,
    'seasons',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name) order by starts_on desc) from public.producer_seasons where producer_id=member.producer_id),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'number',s.entry_number,'competitionStatus',s.competition_status,
      'ropingId',s.roping_id,'ropingName',s.name,'division',s.division,'date',s.scheduled_date,'mainRoundCount',s.main_round_count,
      'resultStatus',s.result_status,'eventTitle',s.title,'eventSlug',s.slug,'public',s.publication_state='published',
      'paidCents',coalesce((select sum(amount_cents) from public.payout_disbursements where entry_id=s.id and producer_id=member.producer_id),0),
      'runs',coalesce((select jsonb_agg(jsonb_build_object('round',run.round_number,'status',run.status,
        'time',case when run.status='complete' and run.raw_time_seconds is not null then round(greatest(run.raw_time_seconds+run.penalty_seconds-e.handicap_time_credit_seconds,0),2) else null end)
        order by run.round_number) from public.competition_runs run join public.roping_entries e on e.id=run.entry_id
        where run.entry_id=s.id and run.producer_id=member.producer_id and not run.is_excluded),'[]'::jsonb),
      'awards',coalesce((select jsonb_agg(jsonb_build_object('ropingId',a.event_roping_id,'planId',a.plan_id,'poolName',a.pool_name,'poolType',a.pool_type,
        'sectionType',a.section_type,'roundNumber',a.round_number,'dNumber',a.d_number,'place',a.place_number,
        'entryId',a.entry_id,'roperId',member.roper_id,'name','', 'time',a.performance_seconds,'payoutCents',a.payout_cents))
        from awards a where a.entry_id=s.id and a.payout_cents>0),'[]'::jsonb)) order by s.scheduled_date desc,s.roping_id,s.id) from selected s),'[]'::jsonb)) into result;
  return result;
end;
$$;
revoke all on function public.my_roper_results(uuid,uuid,integer) from public,anon;
grant execute on function public.my_roper_results(uuid,uuid,integer) to authenticated;
