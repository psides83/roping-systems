begin;
select set_config('request.jwt.claim.sub', (
  select user_id::text from public.producer_staff
  where producer_id = '8f96f20f-932b-45ae-ac93-9832818de64d' and role = 'owner' limit 1
), true);
set local role authenticated;
do $$
declare
  event_id constant uuid := '85981f1d-f150-49b3-bdc9-40eca089cff5';
  roper uuid;
  receipt uuid := gen_random_uuid();
  full_receipt uuid := gen_random_uuid();
  four_d_receipt uuid := gen_random_uuid();
  four_d_award record;
  balance bigint;
  original_paid bigint;
  rejected boolean;
begin
  select a.roper_id into roper from public.event_payout_register_awards(event_id) a
    group by a.roper_id having count(distinct a.event_roping_id) > 1
      and sum(a.payout_cents - a.paid_cents) > 100 order by a.roper_id limit 1;
  if roper is null then raise exception 'Missing multi-roping payout fixture'; end if;
  if not exists (select 1 from public.event_payout_register_awards(event_id) where d_number is not null)
    or not exists (select 1 from public.event_payout_register_awards(event_id) where pool_type <> 'main') then
    raise exception 'Missing 4D or side-pot register awards'; end if;
  select sum(a.payout_cents - a.paid_cents), sum(a.paid_cents) into balance, original_paid
    from public.event_payout_register_awards(event_id) a where a.roper_id = roper;

  perform public.record_roper_payout(event_id, roper, null, 100, 'cash', 'Test recipient', false, 'Rollback test', receipt);
  perform public.record_roper_payout(event_id, roper, null, 100, 'cash', 'Test recipient', false, 'Rollback test', receipt);
  if (select sum(a.paid_cents) from public.event_payout_register_awards(event_id) a where a.roper_id = roper) <> original_paid + 100 then
    raise exception 'Partial payment or retry recorded an incorrect amount'; end if;
  rejected := false;
  begin
    perform public.record_roper_payout(event_id, roper, null, balance::integer, 'cash', 'Test recipient', false, '', gen_random_uuid());
  exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'Overpayment was accepted'; end if;
  rejected := false;
  begin
    perform public.record_roper_payout(event_id, roper, gen_random_uuid(), 1, 'cash', 'Test recipient', false, '', gen_random_uuid());
  exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'Wrong roping scope was accepted'; end if;
  perform public.update_payout_receipt(receipt, 'confirm', '');
  if not exists (select 1 from public.payout_receipts where id = receipt and receipt_confirmed and confirmed_at is not null and confirmed_by = auth.uid()) then
    raise exception 'Receipt acknowledgment was not recorded'; end if;
  perform public.update_payout_receipt(receipt, 'reverse', 'Test reversal');
  if (select sum(a.paid_cents) from public.event_payout_register_awards(event_id) a where a.roper_id = roper) <> original_paid then
    raise exception 'Reversal did not restore the original balance'; end if;
  if not exists (select 1 from public.payout_receipts where id = receipt and reversed_at is not null and reversal_reason = 'Test reversal') then
    raise exception 'Reversal erased the payment history'; end if;
  perform public.record_roper_payout(event_id, roper, null, balance::integer, 'cash', 'Test recipient', true, '', full_receipt);
  if (select sum(a.payout_cents - a.paid_cents) from public.event_payout_register_awards(event_id) a where a.roper_id = roper) <> 0 then
    raise exception 'Combined payment did not clear all winnings'; end if;
  if (select count(distinct event_roping_id) from public.payout_receipt_awards where receipt_id = full_receipt) < 2 then
    raise exception 'Combined payment did not cover multiple ropings'; end if;
  update public.competition_runs set status = 'no_time'
    where entry_id in (select entry_id from public.payout_receipt_awards where receipt_id = full_receipt);
  if not exists (select 1 from public.event_payout_register_awards(event_id) a
    where a.roper_id = roper and a.paid_cents > a.payout_cents) then
    raise exception 'Changed results hid a previously paid award'; end if;
  perform public.update_payout_receipt(full_receipt, 'reverse', 'Restore test balance');

  select * into four_d_award from public.event_payout_register_awards(event_id) a
    where a.d_number is not null and a.payout_cents > a.paid_cents limit 1;
  perform public.record_roper_payout(event_id, four_d_award.roper_id, four_d_award.event_roping_id, 1, 'check', '4D recipient', true, '', four_d_receipt);
  if exists(select 1 from public.payout_receipt_awards where receipt_id = four_d_receipt and event_roping_id <> four_d_award.event_roping_id) then
    raise exception 'Single-roping payment crossed its scope'; end if;
  perform public.update_payout_receipt(four_d_receipt, 'reverse', 'Restore 4D balance');
end;
$$;
reset role;
update public.producer_staff set role = 'viewer'
where user_id = auth.uid() and producer_id = '8f96f20f-932b-45ae-ac93-9832818de64d';
set local role authenticated;
do $$
declare rejected boolean := false;
begin
  begin
    perform public.record_roper_payout('85981f1d-f150-49b3-bdc9-40eca089cff5', gen_random_uuid(), null, 1, 'cash', 'Test', true, '', gen_random_uuid());
  exception when raise_exception then rejected := true; end;
  if not rejected then raise exception 'Viewer recorded a payout'; end if;
end;
$$;
reset role;
set local role anon;
do $$
declare rejected boolean := false;
begin
  if exists (select 1 from public.payout_receipts) then raise exception 'Private payment history exposed'; end if;
  begin
    perform public.event_payout_register_awards('85981f1d-f150-49b3-bdc9-40eca089cff5');
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'Anonymous user accessed the staff register'; end if;
end;
$$;
reset role;
rollback;
