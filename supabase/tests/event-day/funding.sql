create temporary table test_funding_templates(original_id uuid primary key,copy_id uuid,fee_id uuid) on commit drop;
create temporary table test_funding_fee_map(original_id uuid primary key,copy_id uuid) on commit drop;
create temporary table test_public_future_events(id uuid primary key) on commit drop;
do $$
declare producer uuid:=current_setting('test.producer_id')::uuid; fund uuid; deposit_fund uuid; allocation integer; r record; fee uuid; source_fee uuid; copied_template uuid; funding uuid; sponsor uuid; balance bigint; receipt uuid; winner record; event uuid; template record; class_id uuid; member record; live_roping uuid; checks integer:=0; schedule_date date;
begin
  if not exists(select 1 from test_ropings) then return; end if;
  select id into fund from public.producer_funds where producer_id=producer and name='TEST Finals General Fund';
  if fund is null then fund:=gen_random_uuid(); perform public.manage_producer_fund(producer,fund,'TEST Finals General Fund','Simulated funds for event-day testing only',true); end if;
  for r in select er.* from public.event_ropings er join test_ropings tr on tr.roping_id=er.id order by er.event_id,er.sort_order loop
    select copy_id,fee_id into copied_template,source_fee from test_funding_templates where original_id=r.roping_template_id;
    if copied_template is null then
      copied_template:=public.duplicate_division_template(producer,r.roping_template_id);
      update public.roping_templates set name='TEST Fund / '||(select name from public.roping_templates where id=r.roping_template_id),is_active=false where id=copied_template;
      -- Keep copied event fees linked to the corresponding fee in the copied template.
      with originals as (
        select f.id,to_jsonb(f)-array['id','roping_template_id','created_at','updated_at'] as settings,
          row_number() over(partition by to_jsonb(f)-array['id','roping_template_id','created_at','updated_at'] order by f.id) as ordinal
        from public.roping_template_fees f where f.roping_template_id=r.roping_template_id
      ), copies as (
        select f.id,to_jsonb(f)-array['id','roping_template_id','created_at','updated_at'] as settings,
          row_number() over(partition by to_jsonb(f)-array['id','roping_template_id','created_at','updated_at'] order by f.id) as ordinal
        from public.roping_template_fees f where f.roping_template_id=copied_template
      )
      insert into test_funding_fee_map select o.id,c.id from originals o join copies c on c.settings=o.settings and c.ordinal=o.ordinal;
      perform pg_temp.check_test((select count(*) from test_funding_fee_map m join public.roping_template_fees f on f.id=m.original_id where f.roping_template_id=r.roping_template_id)
        =(select count(*) from public.roping_template_fees where roping_template_id=r.roping_template_id),'Every copied template fee has a matching reference');
      select id into source_fee from public.roping_template_fees where roping_template_id=copied_template and kind='added_money' order by sort_order,id limit 1;
      if source_fee is null then
        insert into public.roping_template_fees(producer_id,roping_template_id,title,amount_cents,scope,is_required,contributes_to_payout,included_in_entry_price,kind,fund_tracking,destination_fund_id)
          values(producer,copied_template,'TEST Finals Fund Contribution',1500,'entry',true,false,false,'added_money','general',fund) returning id into source_fee;
      end if;
      insert into test_funding_templates values(r.roping_template_id,copied_template,source_fee);
    end if;
    update public.event_ropings set roping_template_id=copied_template where id=r.id;
    update public.event_fees f set roping_template_fee_id=m.copy_id from test_funding_fee_map m
      where f.event_roping_id=r.id and f.roping_template_fee_id=m.original_id;
    select id into fee from public.event_fees where event_roping_id=r.id and roping_template_fee_id=source_fee;
    if fee is null then
      insert into public.event_fees(producer_id,event_id,event_roping_id,roping_template_fee_id,title,amount_cents,scope,is_required,contributes_to_payout,included_in_entry_price,kind,fund_tracking,destination_fund_id)
        values(producer,r.event_id,r.id,source_fee,'TEST Finals Fund Contribution',1500,'entry',true,false,false,'added_money','general',fund) returning id into fee;
      insert into public.entry_charges(producer_id,event_id,entry_id,roper_id,event_fee_id,title,amount_cents)
        select producer,r.event_id,e.id,e.roper_id,fee,'TEST Finals Fund Contribution',1500 from public.roping_entries e where e.event_roping_id=r.id;
    end if;
    select destination_fund_id into deposit_fund from public.entry_charges where event_fee_id=fee limit 1;
    if deposit_fund<>fund then update public.producer_funds set name='TEST '||name where id=deposit_fund and name not like 'TEST %'; end if;
    perform pg_temp.check_test((select count(*) from public.fund_transactions where fund_id=deposit_fund and event_roping_id=r.id and kind='entry_deposit')=1,'One grouped entry contribution deposit per roping');
    perform pg_temp.check_test((select sum(amount_cents) from public.fund_transactions where fund_id=deposit_fund and event_roping_id=r.id)=
      (select sum(c.amount_cents) from public.entry_charges c join public.roping_entries e on e.id=c.entry_id where e.event_roping_id=r.id and e.payment_status='paid_cash' and c.waived_at is null and c.destination_fund_id=deposit_fund),'Grouped deposit equals paid entry contributions');
    funding:=gen_random_uuid(); sponsor:=gen_random_uuid();
    allocation:=case when deposit_fund=fund then 20000 else 5000 end;
    perform public.save_roping_funding(r.id,funding,'fund',deposit_fund,'',allocation,allocation,'TEST finals money allocated to this roping',false);
    perform public.save_roping_funding(r.id,sponsor,'sponsor',null,'TEST Arena Sponsor',10000,5000,'TEST sponsor commitment',false);
    perform public.set_roping_sponsor_policy(r.id,r.sort_order%2=0);
    perform pg_temp.check_test(public.event_roping_template_snapshot(r.id,false)=public.event_roping_template_snapshot(r.id,true),
      'Fund test roping still matches its template');
    perform pg_temp.check_test(public.roping_added_money_cents(r.id)=allocation+case when r.sort_order%2=0 then 10000 else 5000 end,'Received-only and pledged sponsor policies');
    perform public.finalize_roping_payouts(r.id,false,'TEST results and funding reviewed');
    perform public.finalize_roping_payouts(r.id,false,'TEST idempotent finalization retry');
    perform pg_temp.check_test((select count(*) from public.fund_transactions where funding_id=funding and kind='roping_allocation')=1,'Finalization debits each allocation once');
    if checks=0 then
      perform public.finalize_roping_payouts(r.id,true,'TEST reopening returns the allocation');
      perform pg_temp.check_test((select sum(amount_cents) from public.fund_transactions where funding_id=funding)=0,'Reopening returns used added money');
      perform public.finalize_roping_payouts(r.id,false,'TEST corrected payouts finalized again');
    end if;
    checks:=checks+1;
  end loop;
  update public.producer_funds f set name='TEST '||name where f.producer_id=producer and f.routing_key is not null and f.name not like 'TEST %'
    and not exists(select 1 from public.fund_transactions t where t.fund_id=f.id and (t.event_roping_id is null or t.event_roping_id not in(select roping_id from test_ropings)));
  select sum(amount_cents) into balance from public.fund_transactions where fund_id=fund;
  perform pg_temp.check_test(balance>=0 and public.fund_reserved_cents(fund)=0,'Finalized test funds reconcile without remaining reservations');
  for event in select distinct event_id from test_ropings loop
    select * into winner from public.event_payout_register_awards(event) where payout_cents>paid_cents order by payout_cents desc limit 1;
    receipt:=gen_random_uuid();
    perform public.record_roper_payout(event,winner.roper_id,winner.event_roping_id,100,'cash',winner.contestant_name,true,'TEST acknowledged cash payout',receipt);
    perform public.update_payout_receipt(receipt,'reverse','TEST payout reversal');
    perform public.record_roper_payout(event,winner.roper_id,winner.event_roping_id,100,'cash',winner.contestant_name,true,'TEST acknowledged replacement payout',gen_random_uuid());
    update public.event_ropings set result_status='official' where event_id=event;
    update public.events set result_status='official' where id=event;
  end loop;
  perform public.record_fund_transaction(fund,gen_random_uuid(),'manual_debit',5000,'TEST awards purchased from the fund',null);
  insert into test_report(scenario,detail) values('Funding and receipts',jsonb_build_object('ropings',checks,'fundId',fund,'balanceCents',balance-5000,'groupedDeposits',true,'sponsorPolicies',true,'finalizeReopen',true,'acknowledgedReceipts',true));
  -- Public navigation needs completed results, a live roping, and a future schedule.
  for checks in 1..2 loop
    insert into public.events(producer_id,title,slug,venue_name,venue_city,venue_state,starts_at,ends_at,status,arena_count,publication_state,is_public)
      values(producer,case when checks=1 then 'TEST Live Arena Day' else 'TEST Upcoming Arena Day' end,
        case when current_setting('test.retain')='true' then case when checks=1 then 'test-suite-v2-live' else 'test-suite-v2-upcoming' end else 'automation-'||gen_random_uuid() end,
        'Test Arena','Granbury','TX',case when checks=1 then '2026-12-05 14:00+00'::timestamptz else '2026-12-12 14:00+00'::timestamptz end,
        case when checks=1 then '2026-12-05 23:00+00'::timestamptz else '2026-12-12 23:00+00'::timestamptz end,
        case when checks=1 then 'in_progress'::public.roping_status else 'entries_open'::public.roping_status end,2,'published',true) returning id into event;
    select * into template from public.roping_templates where producer_id=producer and name not ilike '%open%' and competition_format='standard' and main_round_count=3 and is_active limit 1;
    select id into class_id from public.classifications where producer_id=producer and division_id=template.division_id and rank=11.5 and is_active limit 1;
    live_roping:=public.add_roping_to_event(event,template.id,class_id,case when checks=1 then '2026-12-05'::date else '2026-12-12'::date end,'fixed',case when checks=1 then '2026-12-05 09:00'::timestamp else '2026-12-12 09:00'::timestamp end,'TEST public schedule','Arena 1',template.main_round_count,template.cattle_draw_enabled);
    if checks=1 then
      for member in select * from test_members where ordinal<=48 and td_rank=11.5 loop
        perform public.create_event_entry_with_eligibility_override(live_roping,member.roper_id,'office','paid_cash',null);
      end loop;
      perform public.generate_division_draw(live_roping,1);
      for member in select id,draw_position from public.competition_runs where event_roping_id=live_roping and round_number=1 and draw_position<=3 loop
        perform public.record_run_result_multi(member.id,array_fill(10+member.draw_position*0.23,array[template.timer_count]),0,'complete');
      end loop;
      update public.event_ropings set event_day_status='in_progress' where id=live_roping;
    end if;
    schedule_date:=case when checks=1 then '2026-12-05'::date else '2026-12-12'::date end;
    select id into class_id from public.classifications where producer_id=producer and division_id=template.division_id and rank=12 and is_active limit 1;
    perform public.add_roping_to_event(event,template.id,class_id,schedule_date,'follows_previous',null,'TEST follows the #11.5 in Arena 1','Arena 1',template.main_round_count,template.cattle_draw_enabled);
    for template in select * from public.roping_templates where producer_id=producer and is_active and competition_format in ('handicap','four_d') order by case when competition_format='four_d' then 0 else 1 end loop
      class_id:=null;
      if template.competition_format='four_d' then select id into class_id from public.classifications where producer_id=producer and division_id=template.division_id and name='Open' and is_active limit 1; end if;
      perform public.add_roping_to_event(event,template.id,class_id,schedule_date,
        case when template.competition_format='four_d' then 'tentative'::public.class_schedule_type else 'follows_previous'::public.class_schedule_type end,
        schedule_date+time '10:30','TEST Breakaway schedule in Arena 2','Arena 2',template.main_round_count,template.cattle_draw_enabled);
    end loop;
    insert into test_report(scenario,detail) values('Public schedule fixture',jsonb_build_object('eventId',event,'live',checks=1));
    insert into test_public_future_events values(event);
  end loop;
end $$;
