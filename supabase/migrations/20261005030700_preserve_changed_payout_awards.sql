-- Paid awards that disappear after a result correction still need reconciliation.
create or replace function public.event_payout_register_awards(target_event_id uuid)
returns table (
  plan_id uuid, event_roping_id uuid, roping_name text, pool_name text,
  pool_type text, entry_id uuid, roper_id uuid, contestant_name text,
  member_number text, section_type text, round_number integer,
  d_number integer, place_number integer, award_key text,
  payout_cents bigint, paid_cents bigint
)
language sql stable security definer set search_path = '' as $$
  with plans as (
    select p.*, r.competition_format, r.name as roping_name, r.scheduled_date
    from public.event_roping_payout_plans p
    join public.event_ropings r on r.id = p.event_roping_id
    where p.event_id = target_event_id and r.event_day_status = 'completed'
      and public.has_organization_access(p.producer_id)
  ), awards as (
    select p.id as plan_id, p.event_roping_id, p.roping_name, p.scheduled_date,
      p.name as pool_name, p.pool_type, a.entry_id, a.contestant_name,
      a.section_type, a.round_number, null::integer as d_number, a.place_number, a.payout_cents
    from plans p cross join lateral public.calculate_roping_payout_results(p.id) a
    where not (p.competition_format = 'four_d' and p.pool_type = 'main')
    union all
    select p.id, p.event_roping_id, p.roping_name, p.scheduled_date, p.name, p.pool_type,
      a.entry_id, a.contestant_name, 'four_d', null::integer, a.d_number, a.place_number, a.payout_cents
    from plans p cross join lateral public.calculate_four_d_payout_results(p.id) a
    where p.competition_format = 'four_d' and p.pool_type = 'main'
  ), keyed as (
    select a.*, concat_ws(':', a.section_type, coalesce(a.round_number,0), coalesce(a.d_number,0), a.entry_id) as award_key
    from awards a where a.payout_cents > 0
  ), reconciled as (
    select a.plan_id, a.event_roping_id, a.roping_name, a.scheduled_date, a.pool_name, a.pool_type,
      a.entry_id, a.contestant_name, a.section_type, a.round_number, a.d_number,
      a.place_number, a.award_key, a.payout_cents, coalesce(d.amount_cents,0)::bigint as paid_cents
    from keyed a left join public.payout_disbursements d
      on d.payout_plan_id = a.plan_id and d.award_key = a.award_key
    union all
    select p.id, p.event_roping_id, r.name, r.scheduled_date, p.name, p.pool_type,
      d.entry_id, d.contestant_name, d.section_type, d.round_number, d.d_number,
      d.place_number, d.award_key, 0::bigint, d.amount_cents::bigint
    from public.payout_disbursements d
    join public.event_roping_payout_plans p on p.id = d.payout_plan_id
    join public.event_ropings r on r.id = p.event_roping_id
    where d.event_id = target_event_id and public.has_organization_access(d.producer_id)
      and not exists(select 1 from keyed a where a.plan_id = d.payout_plan_id and a.award_key = d.award_key)
  )
  select a.plan_id, a.event_roping_id, a.roping_name || ' · ' || to_char(a.scheduled_date, 'Mon DD, YYYY'),
    a.pool_name, a.pool_type, a.entry_id, e.roper_id, a.contestant_name, m.member_number,
    a.section_type, a.round_number, a.d_number, a.place_number, a.award_key,
    a.payout_cents, a.paid_cents
  from reconciled a join public.roping_entries e on e.id = a.entry_id
  left join public.memberships m on m.id = e.membership_id;
$$;
