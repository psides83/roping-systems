begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text from public.producer_staff where role='owner' order by created_at,user_id limit 1),true);
do $$
declare e uuid; r uuid; other_r uuid; expense uuid:=gen_random_uuid();
begin
  select id into e from public.events where public.can_finance_event(id) order by id limit 1;
  select id into r from public.event_ropings where event_id=e limit 1;
  select id into other_r from public.event_ropings where event_id<>e limit 1;
  perform public.save_event_expense(e,expense,0,null,'arena',15000,'Rental',false);
  perform public.save_event_expense(e,expense,1,r,'cattle',17500,'Cattle cost',false);
  if (select amount_cents from public.event_expenses where id=expense)<>17500 then raise exception 'Expense not updated'; end if;
  begin perform public.save_event_expense(e,expense,1,null,'arena',10000,'Stale',false); raise exception 'Stale edit accepted'; exception when raise_exception then if sqlerrm='Stale edit accepted' then raise; end if; end;
  if other_r is not null then
    begin perform public.save_event_expense(e,gen_random_uuid(),0,other_r,'arena',10000,'Wrong event',false); raise exception 'Foreign roping accepted'; exception when raise_exception then if sqlerrm='Foreign roping accepted' then raise; end if; end;
  end if;
  perform public.save_event_expense(e,expense,2,r,'cattle',17500,'Cattle cost',true);
  if (select voided_at from public.event_expenses where id=expense) is null then raise exception 'Expense not removed'; end if;
  if not exists(select 1 from public.producer_audit_log where entity_type='event_expenses' and entity_id=expense) then raise exception 'Audit missing'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  begin perform public.save_event_expense(e,gen_random_uuid(),0,null,'arena',10000,'Unauthorized',false); raise exception 'Unauthorized expense accepted'; exception when raise_exception then if sqlerrm='Unauthorized expense accepted' then raise; end if; end;
end $$;
set local role authenticated;
do $$ begin if exists(select 1 from public.event_expenses) then raise exception 'Private expense visible to unrelated user'; end if; end $$;
reset role;
rollback;
