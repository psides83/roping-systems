begin;
do $$
declare staff uuid; producer uuid; season uuid; class_id uuid; member public.memberships%rowtype;
  fund uuid; batch uuid:=gen_random_uuid(); fund_batch uuid:=gen_random_uuid(); rows jsonb; preview jsonb; source jsonb; balance bigint; revision bigint;
begin
  select id into strict staff from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',staff::text,true);
  select producer_id into strict producer from public.producer_staff where user_id=staff and role in ('owner','admin') limit 1;
  select id into strict season from public.producer_seasons where producer_id=producer order by starts_on desc limit 1;
  select * into strict member from public.memberships where producer_id=producer limit 1;
  select id into strict class_id from public.classifications where producer_id=producer and standalone_enabled limit 1;
  rows:=jsonb_build_array(jsonb_build_object('row',2,'reference',batch::text,'date',(select starts_on from public.producer_seasons where id=season),
    'memberNumber',member.member_number,'target',class_id,'amountCents',123456,'count',0));
  preview:=public.review_producer_history(producer,season,'standings',rows);
  if preview->'rows'->0->>'error' is not null then raise exception 'Preview failed: %',preview; end if;
  begin
    perform public.apply_producer_history(producer,season,'standings',rows,batch,'history.csv','Rollback standings fixture','{}','stale-snapshot');
    raise exception 'Stale preview accepted';
  exception when others then if sqlerrm not like '%preview changed%' then raise; end if; end;
  select standings_revision into revision from public.producers where id=producer;
  perform public.apply_producer_history(producer,season,'standings',rows,batch,'history.csv','Rollback standings fixture','{}',preview->>'snapshot');
  if (select standings_revision from public.producers where id=producer)<=revision then raise exception 'Qualification freshness not invalidated'; end if;
  perform public.apply_producer_history(producer,season,'standings',rows,batch,'history.csv','Rollback standings fixture','{}',preview->>'snapshot');
  if (select count(*) from public.producer_history_rows where batch_id=batch)<>1 then raise exception 'Retry duplicated history'; end if;
  preview:=public.review_producer_history(producer,season,'standings',rows);
  if preview->'rows'->0->>'operation'<>'duplicate' then raise exception 'Reimport not detected'; end if;
  source:=public.public_season_standings_source((select slug from public.producers where id=producer),season);
  if not exists(select 1 from jsonb_array_elements(source->'contributions') c where c->>'source'='migration' and (c->>'winningsCents')::bigint=123456 and (c->>'attendanceCount')::integer=0) then raise exception 'Public standings missing migration'; end if;
  perform public.reverse_producer_history(batch,'Rollback correction reason');
  source:=public.public_season_standings_source((select slug from public.producers where id=producer),season);
  if exists(select 1 from jsonb_array_elements(source->'contributions') c where c->>'ropingId'='import:'||(select id::text from public.producer_history_rows where batch_id=batch)) then raise exception 'Reversed money still appears'; end if;
  fund:=public.manage_producer_fund(producer,gen_random_uuid(),'Rollback opening fund '||batch::text,'Migration fixture',true);
  rows:=jsonb_build_array(jsonb_build_object('row',2,'reference',fund_batch::text,'date',(select starts_on from public.producer_seasons where id=season),
    'memberNumber','','target',fund,'amountCents',50000,'count',0));
  preview:=public.review_producer_history(producer,season,'fund',rows);
  perform public.apply_producer_history(producer,season,'fund',rows,fund_batch,'funds.csv','Rollback fund fixture','{}',preview->>'snapshot');
  select sum(amount_cents) into balance from public.fund_transactions where fund_id=fund;
  if balance<>50000 then raise exception 'Opening fund not posted'; end if;
  preview:=public.review_producer_history(producer,season,'fund',jsonb_set(rows,'{0,reference}','"different-reference"'));
  if preview->'rows'->0->>'operation'<>'duplicate' then raise exception 'Second opening balance allowed'; end if;
  perform public.record_fund_transaction(fund,gen_random_uuid(),'manual_debit',45000,'Rollback spend fixture',null);
  begin
    perform public.reverse_producer_history(fund_batch,'Reverse spent opening balance');
    raise exception 'Spent opening balance was reversed';
  exception when others then if sqlerrm not like '%Insufficient%fund balance%' then raise; end if; end;
  if (select reversed_at from public.producer_history_batches where id=fund_batch) is not null then raise exception 'Failed reversal mutated batch'; end if;
  perform public.record_fund_transaction(fund,gen_random_uuid(),'manual_deposit',45000,'Rollback return fixture',null);
  perform public.reverse_producer_history(fund_batch,'Opening balance correction');
  if (select coalesce(sum(amount_cents),0) from public.fund_transactions where fund_id=fund)<>0 then raise exception 'Opening reversal did not reconcile fund'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.review_producer_history(producer,season,'fund',rows);
    raise exception 'Unauthorized preview allowed';
  exception when others then if sqlerrm not like '%access is required%' then raise; end if; end;
end $$;
rollback;
