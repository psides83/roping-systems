begin;
do $$
declare
  producer uuid := '8f96f20f-932b-45ae-ac93-9832818de64d';
  fund uuid := gen_random_uuid(); deposit uuid := gen_random_uuid(); debit uuid := gen_random_uuid();
  reversal uuid := gen_random_uuid(); roping public.event_ropings%rowtype; entry public.roping_entries%rowtype;
  fee uuid; copied uuid; count_entries integer := 0; balance bigint;
begin
  perform set_config('request.jwt.claim.sub',(select user_id::text from public.producer_staff where producer_id=producer and role='owner' limit 1),true);
  perform public.manage_producer_fund(producer,fund,'Ledger Test Account '||fund::text,'Test-only account',true);
  perform public.record_fund_transaction(fund,deposit,'manual_deposit',10000,'Test sponsor money received',null);
  perform public.record_fund_transaction(fund,deposit,'manual_deposit',10000,'Test sponsor money received',null);
  perform public.record_fund_transaction(fund,debit,'manual_debit',2500,'Test year-end awards purchase',null);
  select balance_cents into balance from public.producer_fund_balances(producer) where id=fund;
  if balance<>7500 then raise exception 'Manual balance/idempotency failed'; end if;
  begin
    perform public.record_fund_transaction(fund,gen_random_uuid(),'manual_debit',10000,'Overdraw attempt',null);
    raise exception 'Overdraft accepted';
  exception when others then if sqlerrm='Overdraft accepted' then raise; end if; end;
  perform public.record_fund_transaction(fund,reversal,'reversal',null,'Purchase recorded in error',debit);
  select balance_cents into balance from public.producer_fund_balances(producer) where id=fund;
  if balance<>10000 then raise exception 'Reversal failed'; end if;
  if (select balance_cents from public.producer_fund_ledger(fund,0) where id=debit)<>7500
    or (select balance_cents from public.producer_fund_ledger(fund,0) where id=reversal)<>10000 then
    raise exception 'Running balance ordering failed'; end if;
  begin
    perform public.record_fund_transaction(fund,gen_random_uuid(),'reversal',null,'Duplicate reversal attempt',debit);
    raise exception 'Double reversal accepted';
  exception when others then if sqlerrm='Double reversal accepted' then raise; end if; end;
  select * into roping from public.event_ropings where producer_id=producer and roping_template_id is not null and payouts_finalized_at is null
    and exists(select 1 from public.roping_entries e where e.event_roping_id=public.event_ropings.id) limit 1;
  insert into public.roping_template_fees(producer_id,roping_template_id,title,amount_cents,scope,kind,fund_tracking,destination_fund_id,is_required,contributes_to_payout)
    values(producer,roping.roping_template_id,'Ledger Test Fee',1500,'entry','added_money','general',fund,true,false) returning id into fee;
  insert into public.event_fees(producer_id,event_id,event_roping_id,roping_template_fee_id,title,amount_cents,scope,kind,is_required,contributes_to_payout)
    values(producer,roping.event_id,roping.id,fee,'Ledger Test Fee',1500,'entry','added_money',true,false) returning id into copied;
  for entry in select * from public.roping_entries where event_roping_id=roping.id limit 2 loop
    update public.roping_entries set payment_status='unpaid' where id=entry.id;
    insert into public.entry_charges(producer_id,event_id,roper_id,entry_id,event_fee_id,title,amount_cents)
      values(producer,roping.event_id,entry.roper_id,entry.id,copied,'Ledger Test Fee',1500);
    if exists(select 1 from public.fund_transactions where fund_id=fund and event_roping_id=roping.id) and count_entries=0 then raise exception 'Unpaid contribution posted'; end if;
    update public.roping_entries set payment_status='paid_cash' where id=entry.id;
    count_entries:=count_entries+1;
  end loop;
  if count_entries<>2 then raise exception 'Test requires two entries'; end if;
  if exists(select 1 from public.fund_transactions where fund_id=fund and event_roping_id=roping.id) then raise exception 'Contribution deposited before roping completion'; end if;
  update public.event_ropings set event_day_status='completed' where id=roping.id;
  if (select count(*) from public.fund_transactions where fund_id=fund and event_roping_id=roping.id and kind='entry_deposit')<>1 then raise exception 'Multiple per-roper deposits created'; end if;
  if (select sum(amount_cents) from public.fund_transactions where fund_id=fund and event_roping_id=roping.id)<>3000 then raise exception 'Roping contribution total incorrect'; end if;
  perform public.reconcile_roping_fund(fund,roping.id);
  select balance_cents into balance from public.producer_fund_balances(producer) where id=fund;
  if balance<>13000 then raise exception 'Reconciliation duplicated money'; end if;
  update public.roping_entries set payment_status='refunded' where id=entry.id;
  if (select sum(amount_cents) from public.fund_transactions where fund_id=fund and event_roping_id=roping.id)<>1500 then raise exception 'Refund failed to adjust ledger'; end if;
  if (select count(*) from public.fund_transactions where fund_id=fund and event_roping_id=roping.id)<>1 then raise exception 'Refund created individual adjustment deposits'; end if;
  update public.event_ropings set event_day_status='in_progress' where id=roping.id;
  if exists(select 1 from public.fund_transactions where fund_id=fund and event_roping_id=roping.id) then raise exception 'Reopening retained completion deposit'; end if;
  update public.event_ropings set event_day_status='completed' where id=roping.id;
  if (select count(*) from public.fund_transactions where fund_id=fund and event_roping_id=roping.id)<>1 then raise exception 'Recompletion duplicated deposit'; end if;
  perform public.record_fund_transaction(fund,gen_random_uuid(),'manual_debit',11000,'Test spending collected contribution',null);
  begin
    update public.event_ropings set event_day_status='in_progress' where id=roping.id;
    raise exception 'Spent contribution could be removed by reopening';
  exception when others then if sqlerrm='Spent contribution could be removed by reopening' then raise; end if; end;
  perform public.manage_producer_fund(producer,fund,'Ledger Test Account '||fund::text,'Archived test account',false);
  begin
    perform public.record_fund_transaction(fund,gen_random_uuid(),'manual_deposit',500,'Archived deposit attempt',null);
    raise exception 'Archived transaction accepted';
  exception when others then if sqlerrm='Archived transaction accepted' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.producer_fund_ledger(fund,0);
    raise exception 'Unrelated account read ledger';
  exception when others then if sqlerrm='Unrelated account read ledger' then raise; end if; end;
end $$;
select 'Completion deposits, refunds, reopening, overdraft protection, and access checks passed' as result;
rollback;
