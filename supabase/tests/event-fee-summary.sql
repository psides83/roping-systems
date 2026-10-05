begin;
do $$
declare producer uuid:='8f96f20f-932b-45ae-ac93-9832818de64d'; event uuid; expected bigint; actual bigint;
  member uuid; fee uuid; payment uuid; paid bigint; total_collected bigint;
begin
  perform set_config('request.jwt.claim.sub',(select user_id::text from public.producer_staff where producer_id=producer and role='owner' limit 1),true);
  select id into event from public.events where producer_id=producer and slug='test-suite-v2-weekend-2';
  if event is null then raise exception 'Retained fixture missing'; end if;
  select sum(c.amount_cents) into expected from public.entry_charges c where c.event_id=event and c.waived_at is null;
  select sum(collected_cents) into actual from public.event_fee_collection_summary(event);
  if actual<>expected then raise exception 'Paid fixture fee totals mismatch: % versus %',actual,expected; end if;
  total_collected:=actual;
  select roper_id into member from public.roping_entries where event_id=event limit 1;
  select event_fee_id into fee from public.entry_charges where event_id=event and roper_id=member and entry_id is null limit 1;
  if fee is null then raise exception 'Office fee fixture missing'; end if;
  select sum(c.amount_cents) into expected from public.entry_charges c where c.event_fee_id=fee and c.waived_at is null;
  select collected_cents into actual from public.event_fee_collection_summary(event) where fee_id=fee;
  if actual<>expected then raise exception 'Office fee duplicated across ropings'; end if;
  -- Partial receipt: event fee receives the first dollars, not every entered roping.
  insert into public.event_payments(producer_id,event_id,roper_id,amount_cents,received_by_label)
    values(producer,event,member,500,'Test partial receipt') returning id into payment;
  select sum(collected_cents) into actual from public.event_fee_collection_summary(event);
  select sum(c.amount_cents) into paid from public.entry_charges c where c.event_id=event and c.roper_id=member and c.waived_at is null;
  if actual<>total_collected+500-paid then
    raise exception 'Partial receipt not reflected once'; end if;
  if not exists(select 1 from public.event_fee_collection_summary(event) where partial_payments) then raise exception 'Partial allocation disclosure missing'; end if;
  update public.event_payments set voided_at=now(),void_reason='Test voided receipt' where id=payment;
  select sum(collected_cents) into actual from public.event_fee_collection_summary(event);
  if actual<>(select sum(c.amount_cents) from public.entry_charges c where c.event_id=event and c.waived_at is null) then raise exception 'Voided receipt counted'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.event_fee_collection_summary(event);
    raise exception 'Unrelated producer read financial summary';
  exception when others then if sqlerrm='Unrelated producer read financial summary' then raise; end if; end;
end $$;
select 'Fee totals, once-per-event charges, partial receipts, voids, and access checks passed' as result;
rollback;
