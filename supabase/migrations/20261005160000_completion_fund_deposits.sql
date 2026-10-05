-- One contribution deposit per completed roping and fund. Corrections are audited,
-- not appended as a separate bank-ledger transaction for each entry payment.
create or replace function public.reconcile_roping_fund(target_fund_id uuid,target_roping_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare fund public.producer_funds%rowtype; collected bigint:=0; posted bigint; balance bigint;
begin
  select * into fund from public.producer_funds where id=target_fund_id for update;
  if not found then return; end if;
  if exists(select 1 from public.event_ropings where id=target_roping_id and event_day_status='completed') then
    select coalesce(sum(c.amount_cents),0) into collected from public.entry_charges c
      join public.roping_entries e on e.id=c.entry_id and e.producer_id=c.producer_id
      where c.destination_fund_id=fund.id and e.event_roping_id=target_roping_id
        and c.waived_at is null and e.payment_status='paid_cash';
  end if;
  select coalesce(sum(amount_cents),0) into posted from public.fund_transactions
    where fund_id=fund.id and event_roping_id=target_roping_id and kind in ('entry_deposit','entry_adjustment');
  if collected<posted then
    select coalesce(sum(amount_cents),0) into balance from public.fund_transactions where fund_id=fund.id;
    if balance+collected-posted<public.fund_reserved_cents(fund.id) then
      raise exception 'This contribution has already been allocated. Return or cancel fund allocations before reducing it or reopening the roping';
    end if;
  end if;
  delete from public.fund_transactions where fund_id=fund.id and event_roping_id=target_roping_id and kind='entry_adjustment';
  if collected=0 then
    delete from public.fund_transactions where fund_id=fund.id and event_roping_id=target_roping_id and kind='entry_deposit';
  else
    insert into public.fund_transactions(producer_id,fund_id,kind,amount_cents,reason,event_roping_id,created_by,staff_label)
      values(fund.producer_id,fund.id,'entry_deposit',collected,'Combined paid entry-fee contributions at roping completion',target_roping_id,
        auth.uid(),coalesce(auth.jwt()->>'email','Automatic completion reconciliation'))
      on conflict(fund_id,event_roping_id) where kind='entry_deposit'
      do update set amount_cents=excluded.amount_cents,reason=excluded.reason
      where public.fund_transactions.amount_cents<>excluded.amount_cents;
  end if;
end;
$$;

create function public.reconcile_completed_roping_funds() returns trigger
language plpgsql security definer set search_path = '' as $$
declare fund uuid;
begin
  for fund in
    select destination_fund_id from public.entry_charges c join public.roping_entries e on e.id=c.entry_id
      where e.event_roping_id=new.id and destination_fund_id is not null
    union select fund_id from public.fund_transactions where event_roping_id=new.id and kind in ('entry_deposit','entry_adjustment')
    order by 1
  loop perform public.reconcile_roping_fund(fund,new.id); end loop;
  return null;
end;
$$;
create trigger roping_completion_reconcile_funds after update of event_day_status on public.event_ropings
  for each row when(old.event_day_status is distinct from new.event_day_status)
  execute function public.reconcile_completed_roping_funds();
revoke all on function public.reconcile_completed_roping_funds() from public,anon,authenticated;

-- Consolidate existing contribution histories while preserving their audit logs.
do $$
declare pair record; opening record; balance bigint;
begin
  for pair in select distinct fund_id,event_roping_id from public.fund_transactions
    where kind in ('entry_deposit','entry_adjustment') order by fund_id,event_roping_id
  loop perform public.reconcile_roping_fund(pair.fund_id,pair.event_roping_id); end loop;
  -- Remove only the explicitly named artificial test opening balance when safe.
  for opening in select t.* from public.fund_transactions t join public.producer_funds f on f.id=t.fund_id
    where t.kind='manual_deposit' and t.reason='TEST opening fund balance' and f.name='TEST Finals General Fund'
  loop
    select coalesce(sum(amount_cents),0) into balance from public.fund_transactions where fund_id=opening.fund_id;
    if balance-opening.amount_cents>=public.fund_reserved_cents(opening.fund_id)
      and not exists(select 1 from public.fund_transactions where reverses_id=opening.id) then
      delete from public.fund_transactions where id=opening.id;
    end if;
  end loop;
end $$;
