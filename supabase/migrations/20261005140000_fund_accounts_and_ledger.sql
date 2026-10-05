create table public.producer_funds (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  name text not null check(length(trim(name)) between 1 and 120),
  description text not null default '',
  routing_key text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(producer_id,routing_key), unique(id,producer_id)
);
create unique index producer_funds_name_idx on public.producer_funds(producer_id,lower(name));
create table public.fund_transactions (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  fund_id uuid not null,
  kind text not null check(kind in ('entry_deposit','entry_adjustment','manual_deposit','manual_debit','reversal')),
  amount_cents bigint not null check(amount_cents <> 0),
  reason text not null check(length(trim(reason)) between 5 and 2000),
  event_roping_id uuid references public.event_ropings(id),
  reverses_id uuid unique references public.fund_transactions(id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  staff_label text not null,
  foreign key(fund_id,producer_id) references public.producer_funds(id,producer_id),
  check((kind = 'reversal') = (reverses_id is not null)),
  check(kind not in ('entry_deposit','manual_deposit') or amount_cents > 0),
  check(kind <> 'manual_debit' or amount_cents < 0),
  check((kind in ('entry_deposit','entry_adjustment')) = (event_roping_id is not null))
);
create unique index one_roping_fund_deposit on public.fund_transactions(fund_id,event_roping_id) where kind = 'entry_deposit';
create index fund_transactions_account_idx on public.fund_transactions(fund_id,created_at,id);
alter table public.producer_funds enable row level security;
alter table public.fund_transactions enable row level security;
create policy "Producer staff read funds" on public.producer_funds for select to authenticated using(public.has_organization_access(producer_id));
create policy "Producer staff read fund transactions" on public.fund_transactions for select to authenticated using(public.has_organization_access(producer_id));
create trigger audit_producer_funds after insert or update or delete on public.producer_funds for each row execute function public.write_audit_log();
create trigger audit_fund_transactions after insert or update or delete on public.fund_transactions for each row execute function public.write_audit_log();

create function public.manage_producer_fund(target_producer_id uuid,target_fund_id uuid,target_name text,target_description text,target_active boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.can_manage_organization(target_producer_id) then raise exception 'Manager access is required'; end if;
  if target_fund_id is null or length(trim(coalesce(target_name,''))) not between 1 and 120 or target_active is null then raise exception 'Provide a fund name'; end if;
  if exists(select 1 from public.producer_funds where id = target_fund_id and producer_id <> target_producer_id) then raise exception 'Fund not found'; end if;
  insert into public.producer_funds(id,producer_id,name,description,is_active)
    values(target_fund_id,target_producer_id,trim(target_name),coalesce(trim(target_description),''),target_active)
    on conflict(id) do update set name=excluded.name,description=excluded.description,is_active=excluded.is_active;
  return target_fund_id;
end;
$$;
create function public.record_fund_transaction(target_fund_id uuid,target_transaction_id uuid,target_kind text,target_amount_cents bigint,target_reason text,target_reverses_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare fund public.producer_funds%rowtype; original public.fund_transactions%rowtype; amount bigint; balance bigint;
begin
  select * into fund from public.producer_funds where id = target_fund_id for update;
  if not found or auth.uid() is null or not public.can_manage_organization(fund.producer_id) then raise exception 'Manager access is required'; end if;
  if target_transaction_id is null or target_kind is null or target_kind not in ('manual_deposit','manual_debit','reversal')
    or length(trim(coalesce(target_reason,''))) not between 5 and 2000 then raise exception 'Provide a transaction type and a clearly explained reason'; end if;
  if target_kind = 'reversal' then
    select * into original from public.fund_transactions where id = target_reverses_id and fund_id = fund.id and kind in ('manual_deposit','manual_debit');
    if not found then raise exception 'Only manual transactions can be reversed here'; end if;
    amount := -original.amount_cents;
  else
    if not fund.is_active then raise exception 'Reactivate this fund before recording transactions'; end if;
    if target_amount_cents is null or target_amount_cents <= 0 or target_amount_cents > 2147483647 or target_reverses_id is not null then raise exception 'Enter a positive amount'; end if;
    amount := case when target_kind = 'manual_debit' then -target_amount_cents else target_amount_cents end;
  end if;
  if exists(select 1 from public.fund_transactions where id = target_transaction_id) then
    if exists(select 1 from public.fund_transactions where id=target_transaction_id and fund_id=fund.id and kind=target_kind
      and amount_cents=amount and reason=trim(target_reason) and reverses_id is not distinct from target_reverses_id) then return target_transaction_id; end if;
    raise exception 'This transaction reference has already been used';
  end if;
  if target_kind = 'reversal' and exists(select 1 from public.fund_transactions where reverses_id = original.id) then raise exception 'This transaction has already been reversed'; end if;
  select coalesce(sum(amount_cents),0) into balance from public.fund_transactions where fund_id=fund.id;
  if amount < 0 and balance + amount < 0 then raise exception 'Insufficient fund balance'; end if;
  insert into public.fund_transactions(id,producer_id,fund_id,kind,amount_cents,reason,reverses_id,created_by,staff_label)
    values(target_transaction_id,fund.producer_id,fund.id,target_kind,amount,trim(target_reason),target_reverses_id,auth.uid(),coalesce(auth.jwt()->>'email',auth.uid()::text));
  return target_transaction_id;
end;
$$;

alter table public.roping_template_fees add column destination_fund_id uuid references public.producer_funds(id);
alter table public.event_fees add column destination_fund_id uuid references public.producer_funds(id);
alter table public.entry_charges add column destination_fund_id uuid references public.producer_funds(id);
create function public.validate_template_destination_fund() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.destination_fund_id is not null and (new.kind <> 'added_money' or new.fund_tracking <> 'general'
    or not exists(select 1 from public.producer_funds f where f.id=new.destination_fund_id and f.producer_id=new.producer_id and f.is_active)) then
    raise exception 'Choose an active fund from this producer'; end if;
  return new;
end;
$$;
create trigger template_fees_validate_fund before insert or update on public.roping_template_fees for each row execute function public.validate_template_destination_fund();
create or replace function public.copy_added_money_fee_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'added_money' then
    select fund_tracking,destination_fund_id into new.fund_tracking,new.destination_fund_id from public.roping_template_fees
      where id = new.roping_template_fee_id and producer_id = new.producer_id;
    if new.fund_tracking is null then raise exception 'Choose added-money fund tracking on the source template fee'; end if;
  else new.fund_tracking := null; new.destination_fund_id := null;
  end if;
  return new;
end;
$$;

create function public.assign_entry_charge_fund() returns trigger
language plpgsql security definer set search_path = '' as $$
declare fee public.event_fees%rowtype; fund public.producer_funds%rowtype;
begin
  if tg_op = 'UPDATE' then new.destination_fund_id := old.destination_fund_id; return new; end if;
  new.destination_fund_id := null;
  if new.added_money_fund_key is null then return new; end if;
  select * into fee from public.event_fees where id = new.event_fee_id;
  if fee.destination_fund_id is not null then
    select * into fund from public.producer_funds where id=fee.destination_fund_id and producer_id=new.producer_id and is_active;
    if not found then raise exception 'The destination fund is archived. Choose an active fund on the template'; end if;
    new.destination_fund_id := fund.id; new.added_money_fund_label := fund.name;
  else
    insert into public.producer_funds(producer_id,name,routing_key)
      values(new.producer_id,new.added_money_fund_label,new.added_money_fund_key)
      on conflict(producer_id,routing_key) do nothing;
    select * into fund from public.producer_funds where producer_id=new.producer_id and routing_key=new.added_money_fund_key;
    if not fund.is_active then raise exception 'The matching fund is archived. Reactivate it or choose another destination'; end if;
    new.destination_fund_id := fund.id;
  end if;
  return new;
end;
$$;
-- AFTER the existing snapshot BEFORE trigger, by alphabetical trigger order.
create trigger z_entry_charges_assign_fund before insert or update on public.entry_charges for each row execute function public.assign_entry_charge_fund();

create function public.reconcile_roping_fund(target_fund_id uuid,target_roping_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare fund public.producer_funds%rowtype; collected bigint; posted bigint; delta bigint; initial boolean;
begin
  select * into fund from public.producer_funds where id=target_fund_id for update;
  if not found then return; end if;
  select coalesce(sum(c.amount_cents),0) into collected from public.entry_charges c
    join public.roping_entries e on e.id=c.entry_id and e.producer_id=c.producer_id
    where c.destination_fund_id=fund.id and e.event_roping_id=target_roping_id and c.waived_at is null and e.payment_status='paid_cash';
  select coalesce(sum(amount_cents),0) into posted from public.fund_transactions
    where fund_id=fund.id and event_roping_id=target_roping_id and kind in ('entry_deposit','entry_adjustment');
  delta := collected-posted;
  if delta=0 then return; end if;
  initial := not exists(select 1 from public.fund_transactions where fund_id=fund.id and event_roping_id=target_roping_id and kind='entry_deposit');
  insert into public.fund_transactions(producer_id,fund_id,kind,amount_cents,reason,event_roping_id,created_by,staff_label)
    values(fund.producer_id,fund.id,case when initial then 'entry_deposit' else 'entry_adjustment' end,delta,
      case when initial then 'Combined paid entry-fee contributions' else 'Paid entry-fee total reconciled after an entry or payment change' end,
      target_roping_id,auth.uid(),coalesce(auth.jwt()->>'email','Automatic entry reconciliation'));
end;
$$;
create function public.reconcile_charge_fund_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare charge public.entry_charges%rowtype; roping uuid;
begin
  charge := case when tg_op='DELETE' then old else new end;
  if charge.destination_fund_id is not null then
    select event_roping_id into roping from public.roping_entries where id=charge.entry_id;
    if roping is not null then perform public.reconcile_roping_fund(charge.destination_fund_id,roping); end if;
  end if;
  return null;
end;
$$;
create trigger charges_reconcile_funds after insert or update or delete on public.entry_charges for each row execute function public.reconcile_charge_fund_trigger();
create function public.reconcile_entry_funds_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare fund_id uuid;
begin
  for fund_id in select distinct destination_fund_id from public.entry_charges where entry_id=new.id and destination_fund_id is not null order by destination_fund_id loop
    perform public.reconcile_roping_fund(fund_id,new.event_roping_id);
    if old.event_roping_id <> new.event_roping_id then perform public.reconcile_roping_fund(fund_id,old.event_roping_id); end if;
  end loop;
  return null;
end;
$$;
create trigger entries_reconcile_funds after update of payment_status,event_roping_id on public.roping_entries for each row execute function public.reconcile_entry_funds_trigger();

insert into public.producer_funds(producer_id,name,routing_key)
  select producer_id,max(added_money_fund_label),added_money_fund_key from public.entry_charges
    where added_money_fund_key is not null group by producer_id,added_money_fund_key;
alter table public.entry_charges disable trigger z_entry_charges_assign_fund;
update public.entry_charges c set destination_fund_id=f.id from public.producer_funds f
  where f.producer_id=c.producer_id and f.routing_key=c.added_money_fund_key;
alter table public.entry_charges enable trigger z_entry_charges_assign_fund;

create function public.producer_fund_balances(target_producer_id uuid)
returns table(id uuid,name text,description text,is_active boolean,balance_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_organization_access(target_producer_id) then raise exception 'Producer access is required'; end if;
  return query select f.id,f.name,f.description,f.is_active,coalesce(sum(t.amount_cents),0)::bigint
    from public.producer_funds f left join public.fund_transactions t on t.fund_id=f.id
    where f.producer_id=target_producer_id group by f.id order by f.is_active desc,f.name;
end;
$$;
create function public.producer_fund_ledger(target_fund_id uuid,target_offset integer)
returns table(id uuid,kind text,amount_cents bigint,reason text,created_at timestamptz,staff_label text,
  event_roping_id uuid,roping_name text,event_id uuid,event_title text,balance_cents bigint,reversed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from public.producer_funds f where f.id=target_fund_id and public.has_organization_access(f.producer_id)) then raise exception 'Producer access is required'; end if;
  return query
    select t.id,t.kind,t.amount_cents,t.reason,t.created_at,t.staff_label,t.event_roping_id,r.name,r.event_id,e.title,
      t.running_balance,exists(select 1 from public.fund_transactions reversal where reversal.reverses_id=t.id)
    from (select tx.*,sum(tx.amount_cents) over(order by tx.created_at,tx.id)::bigint running_balance
      from public.fund_transactions tx where tx.fund_id=target_fund_id) t
    left join public.event_ropings r on r.id=t.event_roping_id left join public.events e on e.id=r.event_id
    order by t.created_at desc,t.id desc limit 100 offset greatest(coalesce(target_offset,0),0);
end;
$$;
revoke all on function public.producer_fund_balances(uuid),public.producer_fund_ledger(uuid,integer) from public,anon;
grant execute on function public.producer_fund_balances(uuid),public.producer_fund_ledger(uuid,integer) to authenticated;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.event_roping_template_snapshot(uuid,boolean)'::regprocedure) into definition;
  definition := replace(definition,'''fund_tracking'', f.fund_tracking','''fund_tracking'', f.fund_tracking, ''destination_fund_id'', f.destination_fund_id');
  execute definition;
  select pg_get_functiondef('public.duplicate_division_template(uuid,uuid)'::regprocedure) into definition;
  definition := replace(definition,'kind, payout_schedule_id, fund_tracking','kind, payout_schedule_id, fund_tracking, destination_fund_id');
  execute definition;
end $$;
revoke all on function public.manage_producer_fund(uuid,uuid,text,text,boolean),public.record_fund_transaction(uuid,uuid,text,bigint,text,uuid) from public,anon;
grant execute on function public.manage_producer_fund(uuid,uuid,text,text,boolean),public.record_fund_transaction(uuid,uuid,text,bigint,text,uuid) to authenticated;
revoke all on function public.validate_template_destination_fund(),public.assign_entry_charge_fund(),public.reconcile_roping_fund(uuid,uuid),public.reconcile_charge_fund_trigger(),public.reconcile_entry_funds_trigger() from public,anon,authenticated;
