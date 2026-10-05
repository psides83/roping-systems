begin;
do $$
declare producer uuid := '8f96f20f-932b-45ae-ac93-9832818de64d'; roping uuid; fund uuid := gen_random_uuid(); contribution uuid := gen_random_uuid(); sponsor uuid := gen_random_uuid(); baseline bigint; total bigint; winner uuid; event uuid; receipt uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claim.sub',(select user_id::text from public.producer_staff where producer_id=producer and role='owner' limit 1),true);
  select r.id into roping from public.event_ropings r where r.producer_id=producer and r.event_day_status='completed'
    and exists(select 1 from public.event_payout_register_awards(r.event_id) a where a.event_roping_id=r.id and a.pool_type='main' and a.payout_cents>0)
    and not exists(select 1 from public.payout_receipt_awards a join public.payout_receipts p on p.id=a.receipt_id where a.event_roping_id=r.id and p.reversed_at is null) limit 1;
  if roping is null then raise exception 'A completed unpaid test roping is required'; end if;
  baseline := public.roping_added_money_cents(roping);
  select event_id into event from public.event_ropings where id=roping;
  select roper_id into winner from public.event_payout_register_awards(event) where event_roping_id=roping and payout_cents>paid_cents limit 1;
  begin
    perform public.record_roper_payout(event,winner,roping,1,'cash','Test recipient',true,'Rollback receipt',receipt);
    raise exception 'Unfinalized payout was recorded';
  exception when others then if sqlerrm='Unfinalized payout was recorded' then raise; end if; end;
  perform public.manage_producer_fund(producer,fund,'Funding test '||fund,'Rollback test',true);
  perform public.record_fund_transaction(fund,gen_random_uuid(),'manual_deposit',100000,'Test deposit',null);
  perform public.save_roping_funding(roping,contribution,'fund',fund,'',30000,0,'Finals added money',false);
  if public.fund_reserved_cents(fund)<>30000 then raise exception 'Reservation missing'; end if;
  begin
    perform public.record_fund_transaction(fund,gen_random_uuid(),'manual_debit',80000,'Must not spend reserved money',null);
    raise exception 'Reserved money was spent';
  exception when others then if sqlerrm='Reserved money was spent' then raise; end if; end;
  perform public.save_roping_funding(roping,sponsor,'sponsor',null,'Test sponsor',20000,5000,'Sponsor commitment',false);
  if public.roping_added_money_cents(roping)<>baseline+35000 then raise exception 'Received sponsor amount is incorrect'; end if;
  perform public.set_roping_sponsor_policy(roping,true);
  if public.roping_added_money_cents(roping)<>baseline+50000 then raise exception 'Pledged sponsor amount is incorrect'; end if;
  if (select added_money_cents from public.event_roping_payout_plans where event_roping_id=roping and pool_type='main' limit 1)<>baseline+50000 then
    raise exception 'Added money did not reach the main payout calculation'; end if;
  if public.event_roping_template_snapshot(roping,false)::text like '%"added_money_cents"%' then
    raise exception 'Template comparisons still contain roping funding'; end if;
  perform public.finalize_roping_payouts(roping,false,'Reviewed all results and funding');
  perform public.finalize_roping_payouts(roping,false,'Retry same finalization');
  select sum(amount_cents) into total from public.fund_transactions where fund_id=fund;
  if total<>70000 or public.fund_reserved_cents(fund)<>0 then raise exception 'Fund debit not exactly once'; end if;
  begin
    update public.roping_entries set payment_status='unpaid' where event_roping_id=roping;
    raise exception 'Finalized entries changed';
  exception when others then if sqlerrm='Finalized entries changed' then raise; end if; end;
  perform public.save_roping_funding(roping,sponsor,'sponsor',null,'Test sponsor',20000,20000,'Sponsor payment received',false);
  if public.roping_added_money_cents(roping)<>baseline+50000 then raise exception 'Sponsor receipt changed finalized purse'; end if;
  perform public.record_roper_payout(event,winner,roping,1,'cash','Test recipient',true,'Rollback receipt',receipt);
  begin
    perform public.finalize_roping_payouts(roping,true,'Must reverse paid receipt first');
    raise exception 'Paid payouts were reopened';
  exception when others then if sqlerrm='Paid payouts were reopened' then raise; end if; end;
  perform public.update_payout_receipt(receipt,'reverse','Reversing rollback test receipt');
  perform public.finalize_roping_payouts(roping,true,'Reopen for corrected results');
  select sum(amount_cents) into total from public.fund_transactions where fund_id=fund;
  if total<>100000 or public.fund_reserved_cents(fund)<>30000 then raise exception 'Reopening did not restore funds'; end if;
  perform public.save_roping_funding(roping,contribution,'fund',fund,'',30000,0,'Cancelled finals allocation',true);
  if public.fund_reserved_cents(fund)<>0 then raise exception 'Cancellation did not release reservation'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.producer_fund_availability(producer);
    raise exception 'An outsider read producer fund availability';
  exception when others then if sqlerrm<>'Producer access is required' then raise; end if; end;
end $$;
rollback;
