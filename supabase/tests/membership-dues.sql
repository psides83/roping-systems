-- Exercises the live functions but rolls back every fixture and transaction.
begin;
do $$
declare owner_id uuid; producer uuid; season uuid:=gen_random_uuid(); member uuid:=gen_random_uuid(); member2 uuid:=gen_random_uuid(); roper uuid:=gen_random_uuid(); roper2 uuid:=gen_random_uuid();
  general uuid:=gen_random_uuid(); alternate uuid:=gen_random_uuid(); account uuid; account2 uuid; revision integer; reference uuid:=gen_random_uuid(); payment2 uuid:=gen_random_uuid(); payment3 uuid:=gen_random_uuid(); staff uuid; role_name text; balance bigint;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  producer:=public.create_organization('Dues rollback test','dues-test-'||gen_random_uuid()::text);
  insert into public.producer_seasons(id,producer_id,name,starts_on,ends_on) values(season,producer,'Test season','2040-01-01','2040-12-31');
  insert into public.ropers(id,first_name,last_name) values(roper,'Dues','Installment'),(roper2,'Dues','Full');
  insert into public.memberships(id,producer_id,roper_id,member_number,status) values(member,producer,roper,'D-1','active'),(member2,producer,roper2,'D-2','active');
  perform public.manage_producer_fund(producer,general,'General dues fund','Test only',true);
  perform public.manage_producer_fund(producer,alternate,'Class override fund','Test only',true);
  execute 'set local role authenticated';
  revision:=public.save_dues_settings(producer,0,10000,true,'fixed',5000,general);
  account:=public.assess_membership_dues(producer,member,season,alternate);
  begin
    perform public.save_dues_settings(producer,0,10000,true,'fixed',5000,general);
    raise exception 'Stale settings update accepted';
  exception when others then if sqlerrm<>'Dues settings changed. Reload before saving' then raise; end if; end;
  begin
    perform public.assess_membership_dues(producer,member2,season,gen_random_uuid());
    raise exception 'Invalid fund accepted';
  exception when others then if sqlerrm<>'Choose an active producer fund' then raise; end if; end;
  begin
    perform public.assess_membership_dues(producer,member,season,general);
    raise exception 'Duplicate dues charge accepted';
  exception when others then if sqlerrm<>'This member already has dues for this season' then raise; end if; end;
  perform public.record_dues_payment(producer,account,reference,3333,'cash','First installment',null);
  perform public.record_dues_payment(producer,account,reference,3333,'cash','First installment',null);
  perform public.record_dues_payment(producer,account,payment2,3333,'check','Second installment',null);
  perform public.record_dues_payment(producer,account,payment3,3334,'cash','Final installment',null);
  if (select sum(amount_cents) from public.membership_dues_payments where dues_id=account)<>10000 then raise exception 'Incorrect payment total or duplicate retry'; end if;
  if (select sum(contributed_cents) from public.membership_dues_payments where dues_id=account)<>5000 then raise exception 'Installment allocation rounding failed'; end if;
  if (select sum(amount_cents) from public.fund_transactions where fund_id=alternate)<>5000 then raise exception 'Override fund balance incorrect'; end if;
  if exists(select 1 from public.fund_transactions where fund_id=general) then raise exception 'Default fund incorrectly credited'; end if;
  begin
    perform public.record_dues_payment(producer,account,gen_random_uuid(),1,'cash','Extra payment',null);
    raise exception 'Overpayment accepted';
  exception when others then if sqlerrm<>'Payment exceeds the dues balance' then raise; end if; end;
  revision:=public.save_dues_settings(producer,revision,10000,false,'percent',2500,general);
  if (select allocation_cents from public.membership_dues where id=account)<>5000 then raise exception 'Settings altered existing dues'; end if;
  account2:=public.assess_membership_dues(producer,member2,season,general);
  if (select allocation_cents from public.membership_dues where id=account2)<>2500 then raise exception 'Percentage allocation failed'; end if;
  begin
    perform public.record_dues_payment(producer,account2,gen_random_uuid(),5000,'cash','Partial payment',null);
    raise exception 'Disallowed installment accepted';
  exception when others then if sqlerrm<>'This membership requires full payment' then raise; end if; end;
  perform public.record_dues_payment(producer,account2,gen_random_uuid(),10000,'card','Received outside this app',null);
  perform public.record_dues_payment(producer,account,gen_random_uuid(),null,'reversal','Correct first payment',reference);
  if (select sum(amount_cents) from public.fund_transactions where fund_id=alternate)<>3334 then raise exception 'Reversal failed to adjust fund'; end if;
  perform public.record_fund_transaction(alternate,gen_random_uuid(),'manual_debit',3000,'Award expense test',null);
  begin
    perform public.record_dues_payment(producer,account,gen_random_uuid(),null,'reversal','Reverse second payment',payment2);
    raise exception 'Reversal allowed negative available fund';
  exception when others then if sqlerrm<>'The fund has insufficient available money to reverse this contribution' then raise; end if; end;
  if (select sum(amount_cents) from public.membership_dues_payments where dues_id=account)<>6667 then raise exception 'Failed reversal changed dues'; end if;
  begin
    insert into public.membership_dues_payments(id,producer_id,dues_id,amount_cents,contributed_cents,method,reason,created_by,staff_label)
      values(gen_random_uuid(),producer,account,1,0,'cash','Bypass test',owner_id,'Test');
    raise exception 'Direct payment write allowed';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  foreach role_name in array array['admin','operator','treasurer','event_manager','entry_office','timing_staff','viewer'] loop
    perform set_config('request.jwt.claim.sub',owner_id::text,true);
    staff:=gen_random_uuid();
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(staff,'dues-'||staff||'@example.com',now(),'{}');
    insert into public.producer_staff(producer_id,user_id,role) values(producer,staff,role_name::public.organization_role);
    perform set_config('request.jwt.claim.sub',staff::text,true);
    execute 'set local role authenticated';
    if role_name in ('admin','operator','treasurer') then
      perform public.record_dues_payment(producer,account,gen_random_uuid(),3333,'cash','Replacement installment',null);
      select id into reference from public.membership_dues_payments where dues_id=account and reason='Replacement installment' and reverses_id is null order by created_at desc limit 1;
      perform public.record_dues_payment(producer,account,gen_random_uuid(),null,'reversal','Restore test balance',reference);
    else
      begin
        perform public.record_dues_payment(producer,account,gen_random_uuid(),1,'cash','Denied payment',null);
        raise exception '% collected dues',role_name;
      exception when others then if sqlerrm<>'Finance access is required' then raise; end if; end;
    end if;
    if role_name<>'admin' then
      begin
        perform public.save_dues_settings(producer,revision,10000,true,'fixed',0,null);
        raise exception '% changed settings',role_name;
      exception when others then if sqlerrm<>'Administrator access is required' then raise; end if; end;
    end if;
    execute 'reset role';
  end loop;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if not exists(select 1 from public.producer_audit_log where producer_id=producer and entity_type='membership_dues_payments' and actor_user_id=owner_id) then raise exception 'Missing dues audit history'; end if;
  staff:=gen_random_uuid();
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(staff,'outsider-'||staff||'@example.com',now(),'{}');
  perform set_config('request.jwt.claim.sub',staff::text,true);
  execute 'set local role authenticated';
  if exists(select 1 from public.membership_dues where producer_id=producer) or exists(select 1 from public.membership_dues_payments where producer_id=producer) then raise exception 'Dues leaked across producers'; end if;
  begin
    perform public.assess_membership_dues(producer,member,season,general);
    raise exception 'Outsider assessed dues';
  exception when others then if sqlerrm<>'Finance access is required' then raise; end if; end;
  execute 'reset role';
  execute 'set local role anon';
  begin perform 1 from public.membership_dues_payments; raise exception 'Anonymous dues read allowed'; exception when insufficient_privilege then null; end;
  execute 'reset role';
end $$;
rollback;
