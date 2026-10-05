create function public.event_fee_collection_summary(target_event_id uuid)
returns table(fee_id uuid,title text,event_roping_id uuid,roping_name text,kind text,contributes_to_payout boolean,
  assessed_cents bigint,waived_cents bigint,collected_cents bigint,outstanding_cents bigint,charge_count bigint,partial_payments boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.events e where e.id=target_event_id and public.has_organization_access(e.producer_id)) then
    raise exception 'Producer access is required';
  end if;
  return query
  with charges as (
    select c.*,f.event_roping_id as roping_id,f.kind::text as fee_kind,f.contributes_to_payout,
      e.payment_status,
      case when c.entry_id is null then exists(select 1 from public.roping_entries pe
        where pe.event_id=c.event_id and pe.roper_id=c.roper_id and pe.payment_status='paid_cash')
      else e.payment_status='paid_cash' end as marked_paid
    from public.entry_charges c join public.event_fees f on f.id=c.event_fee_id
      left join public.roping_entries e on e.id=c.entry_id
    where c.event_id=target_event_id and (c.entry_id is null or e.payment_status not in ('comped','refunded'))
      and (c.entry_id is not null or exists(select 1 from public.roping_entries pe
        where pe.event_id=c.event_id and pe.roper_id=c.roper_id and pe.payment_status not in ('comped','refunded')))
  ), payments as (
    select p.roper_id,sum(p.amount_cents)::bigint as received from public.event_payments p
      where p.event_id=target_event_id and p.voided_at is null group by p.roper_id
  ), allocated as (
    select c.*,p.received,
      coalesce(sum(case when c.waived_at is null then c.amount_cents else 0 end) over(partition by c.roper_id
        order by (c.entry_id is not null),c.created_at,c.id rows between unbounded preceding and 1 preceding),0) as prior_charges,
      sum(case when c.waived_at is null then c.amount_cents else 0 end) over(partition by c.roper_id) as total_charges
    from charges c left join payments p on p.roper_id=c.roper_id
  ), totals as (
    select a.*,
      case when a.waived_at is not null then 0
        when a.received is not null then least(a.amount_cents,greatest(a.received-a.prior_charges,0))
        when a.marked_paid then a.amount_cents else 0 end::bigint as collected
    from allocated a
  )
  select f.id,f.title,f.event_roping_id,r.name,f.kind::text,f.contributes_to_payout,
    coalesce(sum(t.amount_cents) filter(where t.waived_at is null),0)::bigint,
    coalesce(sum(t.amount_cents) filter(where t.waived_at is not null),0)::bigint,
    coalesce(sum(t.collected),0)::bigint,
    coalesce(sum(t.amount_cents-t.collected) filter(where t.waived_at is null),0)::bigint,
    count(t.id),coalesce(bool_or(t.received>0 and t.received<t.total_charges),false)
  from public.event_fees f left join totals t on t.event_fee_id=f.id left join public.event_ropings r on r.id=f.event_roping_id
    where f.event_id=target_event_id
  group by f.id,r.name,r.sort_order order by (f.event_roping_id is not null),r.sort_order,f.title,f.id;
end;
$$;
revoke all on function public.event_fee_collection_summary(uuid) from public,anon;
grant execute on function public.event_fee_collection_summary(uuid) to authenticated;
