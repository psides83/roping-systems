create or replace function public.producer_added_money_contributions(target_producer_id uuid,target_start date,target_end date)
returns table(fund_key text,fund_label text,event_id uuid,event_title text,roping_date date,fee_title text,
  paid_entries bigint,collected_cents bigint,pending_entries bigint,pending_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_organization_access(target_producer_id) then raise exception 'Producer access is required'; end if;
  if target_start is not null and target_end is not null and target_end < target_start then raise exception 'Choose a valid date range'; end if;
  return query
  select coalesce(f.routing_key,f.id::text,c.added_money_fund_key),max(coalesce(f.name,c.added_money_fund_label)),e.id,e.title,r.scheduled_date,c.title,
    count(*) filter(where entry.payment_status='paid_cash'),
    coalesce(sum(c.amount_cents) filter(where entry.payment_status='paid_cash'),0)::bigint,
    count(*) filter(where entry.payment_status='unpaid' and entry.competition_status='active'),
    coalesce(sum(c.amount_cents) filter(where entry.payment_status='unpaid' and entry.competition_status='active'),0)::bigint
  from public.entry_charges c join public.roping_entries entry on entry.id=c.entry_id and entry.producer_id=c.producer_id
    join public.event_ropings r on r.id=entry.event_roping_id and r.producer_id=c.producer_id
    join public.events e on e.id=c.event_id and e.producer_id=c.producer_id
    left join public.producer_funds f on f.id=c.destination_fund_id and f.producer_id=c.producer_id
  where c.producer_id=target_producer_id and c.added_money_fund_key is not null and c.waived_at is null
    and (entry.payment_status='paid_cash' or (entry.payment_status='unpaid' and entry.competition_status='active'))
    and (target_start is null or r.scheduled_date>=target_start) and (target_end is null or r.scheduled_date<=target_end)
  group by coalesce(f.routing_key,f.id::text,c.added_money_fund_key),e.id,e.title,r.scheduled_date,c.title
  order by r.scheduled_date desc,e.title,c.title;
end;
$$;
