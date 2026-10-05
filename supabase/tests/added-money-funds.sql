begin;
do $$
declare
  producer uuid := '8f96f20f-932b-45ae-ac93-9832818de64d';
  roping public.event_ropings%rowtype; entry public.roping_entries%rowtype;
  fee uuid := gen_random_uuid(); copied uuid := gen_random_uuid(); charge uuid := gen_random_uuid();
  duplicated uuid; collected bigint; pending bigint; handicap_key text;
begin
  perform set_config('request.jwt.claim.sub',(select user_id::text from public.producer_staff where producer_id = producer and role = 'owner' limit 1),true);
  select * into roping from public.event_ropings where producer_id = producer and classification_id is not null and roping_template_id is not null limit 1;
  select * into entry from public.roping_entries where event_roping_id = roping.id and competition_status = 'active' limit 1;
  if entry.id is null then raise exception 'Test requires an entered roping'; end if;
  insert into public.roping_template_fees(id,producer_id,roping_template_id,title,amount_cents,scope,kind,fund_tracking,is_required,contributes_to_payout)
    values(fee,producer,roping.roping_template_id,'Test Finals Contribution',1500,'entry','added_money','general',true,false);
  duplicated := public.duplicate_division_template(producer,roping.roping_template_id);
  if not exists(select 1 from public.roping_template_fees where roping_template_id = duplicated and title = 'Test Finals Contribution' and fund_tracking = 'general') then raise exception 'Template duplication lost fund settings'; end if;
  insert into public.event_fees(id,producer_id,event_id,event_roping_id,roping_template_fee_id,title,amount_cents,scope,kind,is_required,contributes_to_payout)
    values(copied,producer,roping.event_id,roping.id,fee,'Test Finals Contribution',1500,'entry','added_money',true,false);
  if (select fund_tracking from public.event_fees where id = copied) <> 'general' then raise exception 'Event copy lost fund routing'; end if;
  insert into public.entry_charges(id,producer_id,event_id,roper_id,entry_id,event_fee_id,title,amount_cents)
    values(charge,producer,roping.event_id,entry.roper_id,entry.id,copied,'Test Finals Contribution',1500);
  update public.roping_entries set payment_status = 'unpaid' where id = entry.id;
  select sum(collected_cents),sum(pending_cents) into collected,pending from public.producer_added_money_contributions(producer,null,null) where fee_title = 'Test Finals Contribution';
  if collected <> 0 or pending <> 1500 then raise exception 'Unpaid fee counted as collected'; end if;
  update public.roping_entries set payment_status = 'paid_cash' where id = entry.id;
  select sum(collected_cents),sum(pending_cents) into collected,pending from public.producer_added_money_contributions(producer,null,null) where fee_title = 'Test Finals Contribution';
  if collected <> 1500 or pending <> 0 then raise exception 'Paid contribution not counted'; end if;
  if exists(select 1 from public.producer_added_money_contributions(producer,'1900-01-01','1900-12-31') where fee_title = 'Test Finals Contribution') then raise exception 'Date filtering failed'; end if;
  update public.roping_template_fees set fund_tracking = 'classification' where id = fee;
  if public.event_roping_template_snapshot(roping.id,true)->'fees' = public.event_roping_template_snapshot(roping.id,false)->'fees' then raise exception 'Fund drift not detected'; end if;
  update public.event_fees set title = title where id = copied;
  insert into public.entry_charges(producer_id,event_id,roper_id,entry_id,event_fee_id,title,amount_cents)
    select producer,roping.event_id,x.roper_id,x.id,copied,'Test Class Contribution',1500
      from public.roping_entries x where x.event_roping_id = roping.id and x.id <> entry.id limit 1;
  if not exists(select 1 from public.entry_charges where title = 'Test Class Contribution'
    and added_money_fund_key = roping.division_id::text || ':' || roping.classification_id::text) then raise exception 'Classification fund routing failed'; end if;
  update public.entry_charges set added_money_fund_key = 'tampered' where id = charge;
  if (select added_money_fund_key from public.entry_charges where id = charge) <> 'general' then raise exception 'Existing contribution routing changed'; end if;
  update public.entry_charges set waived_at = now(),waiver_reason = 'Test waiver' where id = charge;
  if exists(select 1 from public.producer_added_money_contributions(producer,null,null) where fee_title = 'Test Finals Contribution') then raise exception 'Waived contribution counted'; end if;
  update public.entry_charges set waived_at = null,waiver_reason = null where id = charge;
  update public.roping_entries set payment_status = 'refunded' where id = entry.id;
  if exists(select 1 from public.producer_added_money_contributions(producer,null,null) where fee_title = 'Test Finals Contribution') then raise exception 'Refunded contribution counted'; end if;
  begin
    update public.roping_template_fees set contributes_to_payout = true where id = fee;
    raise exception 'Fund allowed in current purse';
  exception when check_violation then null;
  end;
  select * into roping from public.event_ropings where producer_id = producer and competition_format = 'handicap' limit 1;
  if roping.id is null then raise exception 'Test requires a handicap roping'; end if;
  insert into public.roping_template_fees(producer_id,roping_template_id,title,amount_cents,scope,kind,fund_tracking,is_required,contributes_to_payout)
    values(producer,roping.roping_template_id,'Test Handicap Fund',1500,'entry','added_money','classification',true,false) returning id into fee;
  insert into public.event_fees(producer_id,event_id,event_roping_id,roping_template_fee_id,title,amount_cents,scope,kind,is_required,contributes_to_payout)
    values(producer,roping.event_id,roping.id,fee,'Test Handicap Fund',1500,'entry','added_money',true,false) returning id into copied;
  for entry in select * from public.roping_entries where event_roping_id = roping.id limit 2 loop
    insert into public.entry_charges(producer_id,event_id,roper_id,entry_id,event_fee_id,title,amount_cents)
      values(producer,roping.event_id,entry.roper_id,entry.id,copied,'Test Handicap Fund',1500);
  end loop;
  select min(added_money_fund_key) into handicap_key from public.entry_charges where event_fee_id = copied;
  if handicap_key <> roping.division_id::text || ':handicap' or (select count(distinct added_money_fund_key) from public.entry_charges where event_fee_id = copied) <> 1 then
    raise exception 'Handicap contributions split into separate member classifications'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.producer_added_money_contributions(producer,null,null);
    raise exception 'Unrelated account read funds';
  exception when others then
    if sqlerrm = 'Unrelated account read funds' then raise; end if;
  end;
end $$;
rollback;
