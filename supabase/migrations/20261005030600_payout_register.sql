create table public.payout_receipts (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  event_id uuid not null references public.events(id),
  roper_id uuid not null references public.ropers(id),
  amount_cents integer not null check (amount_cents > 0),
  payment_method text not null check (payment_method in ('cash', 'check', 'other')),
  received_by text not null check (length(trim(received_by)) between 1 and 200),
  receipt_confirmed boolean not null default false,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id),
  note text not null default '' check (length(note) <= 1000),
  paid_at timestamptz not null default now(),
  paid_by uuid references auth.users(id),
  paid_by_label text not null,
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id),
  reversal_reason text,
  check (receipt_confirmed = (confirmed_at is not null)),
  check ((reversed_at is null) = (reversal_reason is null))
);
create index payout_receipts_event_idx on public.payout_receipts(event_id, paid_at desc);

create table public.payout_receipt_awards (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  receipt_id uuid not null references public.payout_receipts(id),
  payout_plan_id uuid not null references public.event_roping_payout_plans(id),
  event_roping_id uuid not null references public.event_ropings(id),
  entry_id uuid not null references public.roping_entries(id),
  award_key text not null,
  amount_cents integer not null check (amount_cents > 0),
  unique(receipt_id, payout_plan_id, award_key)
);
create index payout_receipt_awards_receipt_idx on public.payout_receipt_awards(receipt_id);
alter table public.payout_receipts enable row level security;
alter table public.payout_receipt_awards enable row level security;
create policy "Staff can read payout receipts" on public.payout_receipts for select
  to authenticated using (public.has_organization_access(producer_id));
create policy "Staff can read payout receipt awards" on public.payout_receipt_awards for select
  to authenticated using (public.has_organization_access(producer_id));
create trigger audit_payout_receipts after insert or update or delete on public.payout_receipts
  for each row execute function public.write_audit_log();
create trigger audit_payout_receipt_awards after insert or update or delete on public.payout_receipt_awards
  for each row execute function public.write_audit_log();

create function public.event_payout_register_awards(target_event_id uuid)
returns table (
  plan_id uuid, event_roping_id uuid, roping_name text, pool_name text,
  pool_type text, entry_id uuid, roper_id uuid, contestant_name text,
  member_number text, section_type text, round_number integer,
  d_number integer, place_number integer, award_key text,
  payout_cents bigint, paid_cents bigint
)
language sql stable security definer set search_path = '' as $$
  with plans as (
    select p.*, r.competition_format, r.name as roping_name, r.scheduled_date
    from public.event_roping_payout_plans p
    join public.event_ropings r on r.id = p.event_roping_id
    where p.event_id = target_event_id and r.event_day_status = 'completed'
      and public.has_organization_access(p.producer_id)
  ), awards as (
    select p.id as plan_id, p.event_roping_id, p.roping_name, p.scheduled_date,
      p.name as pool_name, p.pool_type, a.entry_id, a.contestant_name,
      a.section_type, a.round_number, null::integer as d_number, a.place_number, a.payout_cents
    from plans p cross join lateral public.calculate_roping_payout_results(p.id) a
    where not (p.competition_format = 'four_d' and p.pool_type = 'main')
    union all
    select p.id, p.event_roping_id, p.roping_name, p.scheduled_date, p.name, p.pool_type,
      a.entry_id, a.contestant_name, 'four_d', null::integer, a.d_number, a.place_number, a.payout_cents
    from plans p cross join lateral public.calculate_four_d_payout_results(p.id) a
    where p.competition_format = 'four_d' and p.pool_type = 'main'
  ), keyed as (
    select a.*, concat_ws(':', a.section_type, coalesce(a.round_number,0), coalesce(a.d_number,0), a.entry_id) as award_key
    from awards a where a.payout_cents > 0
  )
  select a.plan_id, a.event_roping_id, a.roping_name || ' · ' || to_char(a.scheduled_date, 'Mon DD, YYYY'),
    a.pool_name, a.pool_type, a.entry_id, e.roper_id, a.contestant_name, m.member_number,
    a.section_type, a.round_number, a.d_number, a.place_number, a.award_key,
    a.payout_cents, coalesce(d.amount_cents,0)::bigint
  from keyed a join public.roping_entries e on e.id = a.entry_id
  left join public.memberships m on m.id = e.membership_id
  left join public.payout_disbursements d on d.payout_plan_id = a.plan_id and d.award_key = a.award_key;
$$;

create function public.record_roper_payout(
  target_event_id uuid, target_roper_id uuid, target_event_roping_id uuid,
  target_amount_cents integer, target_payment_method text, target_received_by text,
  target_receipt_confirmed boolean, target_note text, target_receipt_id uuid
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  producer uuid;
  award record;
  remaining integer := target_amount_cents;
  allocated integer;
  available bigint;
  existing public.payout_receipts%rowtype;
begin
  select e.producer_id into producer from public.events e where e.id = target_event_id for update;
  if producer is null or auth.uid() is null or not public.can_manage_organization(producer) then
    raise exception 'You do not have permission to record this payout';
  end if;
  if target_receipt_id is null or target_amount_cents is null or target_amount_cents <= 0
    or target_payment_method is null or target_payment_method not in ('cash','check','other')
    or nullif(trim(target_received_by),'') is null or length(trim(target_received_by)) > 200
    or length(coalesce(target_note,'')) > 1000 or target_receipt_confirmed is null then
    raise exception 'Enter a valid payout amount, payment method, and recipient';
  end if;
  -- A retry must never hand out or record the same payment twice.
  select * into existing from public.payout_receipts where id = target_receipt_id;
  if existing.id is not null then
    if existing.event_id = target_event_id and existing.roper_id = target_roper_id
      and existing.producer_id = producer and existing.amount_cents = target_amount_cents
      and existing.reversed_at is null then return existing.id; end if;
    raise exception 'This payment reference has already been used';
  end if;
  if exists (select 1 from public.event_payout_register_awards(target_event_id) a
    where a.roper_id = target_roper_id and (target_event_roping_id is null or a.event_roping_id = target_event_roping_id)
      and a.paid_cents > a.payout_cents) then
    raise exception 'Winnings changed after payment. Review the recorded payments before paying again';
  end if;
  select sum(a.payout_cents - a.paid_cents) into available
    from public.event_payout_register_awards(target_event_id) a
    where a.roper_id = target_roper_id and (target_event_roping_id is null or a.event_roping_id = target_event_roping_id);
  if available is null or target_amount_cents > available then
    raise exception 'The payment exceeds the remaining winnings for completed ropings';
  end if;
  insert into public.payout_receipts(id, producer_id, event_id, roper_id, amount_cents,
    payment_method, received_by, receipt_confirmed, confirmed_at, confirmed_by, note, paid_by, paid_by_label)
  values (target_receipt_id, producer, target_event_id, target_roper_id, target_amount_cents,
    target_payment_method, trim(target_received_by), target_receipt_confirmed,
    case when target_receipt_confirmed then now() end,
    case when target_receipt_confirmed then auth.uid() end, trim(coalesce(target_note,'')), auth.uid(),
    coalesce(auth.jwt()->>'email', auth.uid()::text));
  for award in select * from public.event_payout_register_awards(target_event_id) a
    where a.roper_id = target_roper_id and (target_event_roping_id is null or a.event_roping_id = target_event_roping_id)
      and a.payout_cents > a.paid_cents
    order by a.event_roping_id, case when a.pool_type = 'main' then 0 else 1 end, a.plan_id, a.award_key
  loop
    exit when remaining = 0;
    allocated := least(remaining::bigint, award.payout_cents - award.paid_cents)::integer;
    insert into public.payout_receipt_awards(producer_id, receipt_id, payout_plan_id, event_roping_id, entry_id, award_key, amount_cents)
    values (producer, target_receipt_id, award.plan_id, award.event_roping_id, award.entry_id, award.award_key, allocated);
    insert into public.payout_disbursements(producer_id, event_id, payout_plan_id, entry_id, award_key,
      section_type, round_number, d_number, place_number, contestant_name, amount_cents, paid_by, paid_by_label)
    values (producer, target_event_id, award.plan_id, award.entry_id, award.award_key,
      award.section_type, award.round_number, award.d_number, award.place_number, award.contestant_name,
      allocated, auth.uid(), coalesce(auth.jwt()->>'email', auth.uid()::text))
    on conflict (payout_plan_id, award_key) do update
      set amount_cents = public.payout_disbursements.amount_cents + excluded.amount_cents,
        paid_by = excluded.paid_by, paid_by_label = excluded.paid_by_label, paid_at = now();
    remaining := remaining - allocated;
  end loop;
  if remaining <> 0 then raise exception 'Winnings changed. Reload the register and try again'; end if;
  return target_receipt_id;
end;
$$;

create function public.update_payout_receipt(target_receipt_id uuid, target_action text, target_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  receipt public.payout_receipts%rowtype;
  allocation record;
begin
  select * into receipt from public.payout_receipts where id = target_receipt_id;
  if receipt.id is null or auth.uid() is null or not public.can_manage_organization(receipt.producer_id) then
    raise exception 'You do not have permission to change this payment';
  end if;
  perform 1 from public.events where id = receipt.event_id for update;
  select * into receipt from public.payout_receipts where id = target_receipt_id for update;
  if receipt.reversed_at is not null then raise exception 'This payment has already been reversed'; end if;
  if target_action = 'confirm' then
    if not receipt.receipt_confirmed then
      update public.payout_receipts set receipt_confirmed = true, confirmed_at = now(), confirmed_by = auth.uid()
      where id = target_receipt_id;
    end if;
  elsif target_action = 'reverse' then
    if nullif(trim(target_reason),'') is null or length(target_reason) > 1000 then
      raise exception 'Enter a reason for reversing this payment';
    end if;
    for allocation in select * from public.payout_receipt_awards where receipt_id = receipt.id loop
      if not exists (select 1 from public.payout_disbursements d where d.payout_plan_id = allocation.payout_plan_id
        and d.award_key = allocation.award_key and d.amount_cents >= allocation.amount_cents) then
        raise exception 'The payment allocation has changed and needs review';
      end if;
      delete from public.payout_disbursements where payout_plan_id = allocation.payout_plan_id
        and award_key = allocation.award_key and amount_cents = allocation.amount_cents;
      update public.payout_disbursements set amount_cents = amount_cents - allocation.amount_cents
        where payout_plan_id = allocation.payout_plan_id and award_key = allocation.award_key;
    end loop;
    update public.payout_receipts set reversed_at = now(), reversed_by = auth.uid(), reversal_reason = trim(target_reason)
    where id = receipt.id;
  else raise exception 'Invalid payment action'; end if;
end;
$$;

revoke all on function public.event_payout_register_awards(uuid) from public, anon;
revoke all on function public.record_roper_payout(uuid,uuid,uuid,integer,text,text,boolean,text,uuid) from public, anon;
revoke all on function public.update_payout_receipt(uuid,text,text) from public, anon;
grant execute on function public.event_payout_register_awards(uuid) to authenticated;
grant execute on function public.record_roper_payout(uuid,uuid,uuid,integer,text,text,boolean,text,uuid) to authenticated;
grant execute on function public.update_payout_receipt(uuid,text,text) to authenticated;
-- All staff payment changes now go through the validated register.
revoke execute on function public.record_payout_disbursement(uuid,uuid,text,text,integer,integer,integer,text,integer) from authenticated, anon, public;
revoke execute on function public.remove_payout_disbursement(uuid,text) from authenticated, anon, public;
