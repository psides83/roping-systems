begin;
do $$
<<permission_test>>
declare platform_user uuid; manager_user uuid:=gen_random_uuid(); treasurer_user uuid:=gen_random_uuid();
  target record; member_roper uuid; invitation uuid; other_event uuid; created_entry uuid;
  r record; run record; round_index integer; readings numeric[]; fund_id uuid:=gen_random_uuid();
  deposit_id uuid:=gen_random_uuid(); debit_id uuid:=gen_random_uuid(); receipt_id uuid:=gen_random_uuid();
  award record; balance bigint;
  foreign_producer uuid;
begin
  select id into strict platform_user from auth.users where lower(email)='psides83@hotmail.com';
  select chosen.id,chosen.producer_id,chosen.event_id,chosen.scheduled_date,chosen.arena_name into strict target
    from public.event_ropings chosen where chosen.event_id='0405a4f6-bdf6-49d6-af75-7f665006308b'
      and chosen.name ilike '%open%' order by chosen.id limit 1;
  select m.roper_id into strict member_roper from public.memberships m join public.ropers p on p.id=m.roper_id
    where m.producer_id=target.producer_id and m.status='active' and p.competition_gender='female'
      and not exists(select 1 from public.roping_entries e where e.event_roping_id=target.id and e.roper_id=m.roper_id)
    order by m.id limit 1;
  select id into strict other_event from public.events where id<>target.event_id order by id limit 1;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (manager_user,'manager-'||manager_user::text||'@example.com',now(),'{}'),
    (treasurer_user,'treasurer-'||treasurer_user::text||'@example.com',now(),'{}');
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  foreign_producer:=public.create_organization('Role isolation test','role-isolation-'||gen_random_uuid()::text);
  invitation:=public.invite_producer_staff(target.producer_id,'manager-'||manager_user::text||'@example.com','event_manager');
  perform set_config('request.jwt.claim.sub',manager_user::text,true);
  perform public.accept_staff_invitation(invitation);
  if public.can_manage_event(target.event_id) then raise exception 'Unassigned event manager can manage'; end if;
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  perform public.assign_staff_event(target.producer_id,target.event_id,manager_user,true);
  invitation:=public.invite_producer_staff(target.producer_id,'treasurer-'||treasurer_user::text||'@example.com','treasurer');
  perform set_config('request.jwt.claim.sub',treasurer_user::text,true);
  perform public.accept_staff_invitation(invitation);
  perform set_config('request.jwt.claim.sub',manager_user::text,true);
  execute 'set local role authenticated';
  if not public.can_manage_event(target.event_id) or not public.can_time_event(target.event_id)
    or not public.can_enter_event(target.event_id) or public.can_manage_event(other_event)
    or public.can_manage_finances(target.producer_id) or public.can_manage_organization(target.producer_id) then
    raise exception 'Event manager permissions incorrect';
  end if;
  perform public.set_event_publication(target.event_id,'published');
  begin
    perform public.manage_producer_staff(target.producer_id,manager_user,'owner');
    raise exception 'Manager promoted own staff role';
  exception when others then
    if sqlerrm<>'Staff management requires an owner or administrator.' then raise; end if;
  end;
  begin
    perform public.set_event_publication(other_event,'published');
    raise exception 'Manager published unassigned event';
  exception when others then
    if sqlerrm<>'Event management access is required' then raise; end if;
  end;
  begin
    perform public.manage_producer_fund(target.producer_id,fund_id,'Unauthorized fund','',true);
    raise exception 'Manager changed producer funds';
  exception when others then
    if sqlerrm<>'Manager access is required' then raise; end if;
  end;
  perform public.save_roping_schedule(target.id,target.scheduled_date,'fixed',target.scheduled_date+time '09:00','Permission test',target.arena_name);
  created_entry:=public.create_event_entry_with_eligibility_override(target.id,member_roper,'office','paid_cash',null);
  perform public.initialize_roping_payout_plans(target.event_id);
  perform public.set_roping_in_progress(target.event_id);
  for r in select er.* from public.event_ropings er where er.event_id=target.event_id
    and exists(select 1 from public.roping_entries e where e.event_roping_id=er.id and e.competition_status='active') loop
    for round_index in 1..r.main_round_count loop
      perform public.generate_division_draw(r.id,round_index);
      for run in select cr.id from public.competition_runs cr where cr.event_roping_id=r.id and cr.round_number=round_index loop
        select array_agg((12.34+round_index)::numeric) into readings from generate_series(1,r.timer_count);
        perform public.save_run_with_penalties(run.id,readings,'{}','complete');
      end loop;
      perform public.complete_roping_round(r.id,round_index);
    end loop;
    if r.short_round_enabled then
      perform public.seed_short_round(r.id);
      perform public.lock_short_round_field(r.id);
      for run in select cr.id from public.competition_runs cr where cr.event_roping_id=r.id and cr.round_number>r.main_round_count loop
        select array_agg(12.34::numeric) into readings from generate_series(1,r.timer_count);
        perform public.save_run_with_penalties(run.id,readings,'{}','complete');
      end loop;
    end if;
    perform public.update_class_event_day_status(r.id,r.arena_name,'completed',null,'Permission test completed');
  end loop;
  perform public.finalize_roping_results(target.event_id);
  perform set_config('request.jwt.claim.sub',treasurer_user::text,true);
  if not public.can_finance_event(target.event_id) or not public.can_manage_finances(target.producer_id)
    or public.can_time_event(target.event_id) or public.can_manage_event(target.event_id)
    or public.can_enter_event(target.event_id) or public.can_administer_organization(target.producer_id) then
    raise exception 'Treasurer permissions incorrect';
  end if;
  if public.can_manage_finances(foreign_producer) then raise exception 'Treasurer can manage another producer finances'; end if;
  begin
    perform public.manage_producer_fund(foreign_producer,gen_random_uuid(),'Unauthorized cross-producer fund','',true);
    raise exception 'Treasurer created a cross-producer fund';
  exception when others then
    if sqlerrm<>'Manager access is required' then raise; end if;
  end;
  begin
    perform public.set_event_publication(target.event_id,'unpublished');
    raise exception 'Treasurer changed publication';
  exception when others then
    if sqlerrm<>'Event management access is required' then raise; end if;
  end;
  perform public.manage_producer_fund(target.producer_id,fund_id,'Treasurer test '||fund_id::text,'Rollback only',true);
  perform public.record_fund_transaction(fund_id,deposit_id,'manual_deposit',10000,'Permission test deposit',null);
  perform public.record_fund_transaction(fund_id,debit_id,'manual_debit',1000,'Permission test debit',null);
  perform public.record_fund_transaction(fund_id,gen_random_uuid(),'reversal',null,'Permission test reversal',debit_id);
  perform public.set_roping_sponsor_policy(target.id,true);
  perform public.save_roping_funding(target.id,gen_random_uuid(),'sponsor',null,'Permission test sponsor',10000,5000,'Permission test sponsor contribution',false);
  perform public.save_roping_funding(target.id,gen_random_uuid(),'fund',fund_id,'',1000,1000,'Permission test allocation',false);
  perform public.finalize_roping_payouts(target.id,false,'Permission test finalization');
  select sum(t.amount_cents) into balance from public.fund_transactions t where t.fund_id=permission_test.fund_id;
  if balance<>9000 then raise exception 'Finalization did not debit the fund correctly'; end if;
  select a.roper_id,sum(a.payout_cents-a.paid_cents)::integer as due into strict award
    from public.event_payout_register_awards(target.event_id) a where a.event_roping_id=target.id
    group by a.roper_id having sum(a.payout_cents-a.paid_cents)>0 order by a.roper_id limit 1;
  perform public.record_roper_payout(target.event_id,award.roper_id,target.id,award.due,'cash','Test recipient',false,'Permission test payout',receipt_id);
  perform public.update_payout_receipt(receipt_id,'confirm','Receipt acknowledged');
  if not exists(select 1 from public.payout_receipts where id=receipt_id and receipt_confirmed) then raise exception 'Receipt acknowledgment missing'; end if;
  perform public.update_payout_receipt(receipt_id,'reverse','Permission test reversal');
  update public.classifications set id=id where producer_id=target.producer_id;
  if found then raise exception 'Treasurer edited classifications'; end if;
  update public.competition_runs set id=id where producer_id=target.producer_id;
  if found then raise exception 'Treasurer edited competition'; end if;
end;
$$;
rollback;
