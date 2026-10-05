alter table public.fund_transactions add column ledger_sequence bigint generated always as identity;
alter table public.fund_transactions alter column created_at set default clock_timestamp();
create index fund_transactions_sequence_idx on public.fund_transactions(fund_id,ledger_sequence);
create or replace function public.producer_fund_ledger(target_fund_id uuid,target_offset integer)
returns table(id uuid,kind text,amount_cents bigint,reason text,created_at timestamptz,staff_label text,
  event_roping_id uuid,roping_name text,event_id uuid,event_title text,balance_cents bigint,reversed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.producer_funds f where f.id=target_fund_id and public.has_organization_access(f.producer_id)) then raise exception 'Producer access is required'; end if;
  return query
    select t.id,t.kind,t.amount_cents,t.reason,t.created_at,t.staff_label,t.event_roping_id,r.name,r.event_id,e.title,
      t.running_balance,exists(select 1 from public.fund_transactions reversal where reversal.reverses_id=t.id)
    from (select tx.*,sum(tx.amount_cents) over(order by tx.ledger_sequence)::bigint running_balance
      from public.fund_transactions tx where tx.fund_id=target_fund_id) t
    left join public.event_ropings r on r.id=t.event_roping_id left join public.events e on e.id=r.event_id
    order by t.ledger_sequence desc limit 100 offset greatest(coalesce(target_offset,0),0);
end;
$$;
create or replace function public.reconcile_charge_fund_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare charge public.entry_charges%rowtype; roping uuid;
begin
  charge := case when tg_op='DELETE' then old else new end;
  if charge.destination_fund_id is not null then
    select event_roping_id into roping from public.roping_entries where id=charge.entry_id;
    if roping is null then select event_roping_id into roping from public.event_fees where id=charge.event_fee_id; end if;
    if roping is not null then perform public.reconcile_roping_fund(charge.destination_fund_id,roping); end if;
  end if;
  return null;
end;
$$;
