create table public.producer_dues_settings (
  id uuid not null unique default gen_random_uuid(),
  producer_id uuid primary key references public.producers(id),
  amount_cents bigint not null check(amount_cents between 1 and 2147483647),
  installments boolean not null default false,
  allocation_mode text not null check(allocation_mode in ('fixed','percent')),
  allocation_value bigint not null check(allocation_value>=0),
  fund_id uuid,
  revision integer not null default 1,
  foreign key(fund_id,producer_id) references public.producer_funds(id,producer_id),
  check((allocation_mode='fixed' and allocation_value<=amount_cents) or (allocation_mode='percent' and allocation_value<=10000)),
  check(allocation_value=0 or fund_id is not null)
);
alter table public.producer_seasons add constraint dues_season_producer_unique unique(id,producer_id);
create table public.membership_dues (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  membership_id uuid not null,
  season_id uuid not null,
  amount_cents bigint not null check(amount_cents between 1 and 2147483647),
  installments boolean not null,
  allocation_cents bigint not null check(allocation_cents>=0 and allocation_cents<=amount_cents),
  fund_id uuid,
  created_at timestamptz not null default now(),
  unique(membership_id,season_id), unique(id,producer_id),
  foreign key(membership_id,producer_id) references public.memberships(id,producer_id),
  foreign key(season_id,producer_id) references public.producer_seasons(id,producer_id),
  foreign key(fund_id,producer_id) references public.producer_funds(id,producer_id),
  check(allocation_cents=0 or fund_id is not null)
);
create table public.membership_dues_payments (
  id uuid primary key,
  producer_id uuid not null references public.producers(id),
  dues_id uuid not null,
  amount_cents bigint not null check(amount_cents<>0),
  contributed_cents bigint not null,
  method text not null check(method in ('cash','check','card','other','reversal')),
  reason text not null check(length(trim(reason)) between 5 and 2000),
  reverses_id uuid unique references public.membership_dues_payments(id),
  created_by uuid not null references auth.users(id),
  staff_label text not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(dues_id,producer_id) references public.membership_dues(id,producer_id),
  check((method='reversal')=(reverses_id is not null)),
  check((method='reversal')=(amount_cents<0)),
  check(abs(contributed_cents)<=abs(amount_cents)),
  check((amount_cents>0 and contributed_cents>=0) or (amount_cents<0 and contributed_cents<=0))
);
alter table public.fund_transactions add column dues_payment_id uuid unique references public.membership_dues_payments(id);
alter table public.fund_transactions drop constraint fund_transactions_kind_check;
alter table public.fund_transactions add constraint fund_transactions_kind_check check(kind in ('entry_deposit','entry_adjustment','manual_deposit','manual_debit','reversal','roping_allocation','roping_return','membership_deposit','membership_adjustment'));
alter table public.fund_transactions add constraint dues_transaction_source check((kind in ('membership_deposit','membership_adjustment'))=(dues_payment_id is not null));
alter table public.fund_transactions add constraint dues_transaction_sign check((kind<>'membership_deposit' or amount_cents>0) and (kind<>'membership_adjustment' or amount_cents<0));
create index membership_dues_season_idx on public.membership_dues(producer_id,season_id);
create index dues_payments_account_idx on public.membership_dues_payments(dues_id,created_at);
do $$ declare t text; begin
  foreach t in array array['producer_dues_settings','membership_dues','membership_dues_payments'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy "Staff read dues" on public.%I for select to authenticated using(public.has_organization_access(producer_id))',t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.write_audit_log()',t,t);
  end loop;
end $$;

create function public.save_dues_settings(target_producer uuid,expected_revision integer,amount bigint,allow_installments boolean,mode text,allocation bigint,target_fund uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare rev integer;
begin
  if not public.can_administer_organization(target_producer) then raise exception 'Administrator access is required'; end if;
  perform 1 from public.producers where id=target_producer for update;
  select revision into rev from public.producer_dues_settings where producer_id=target_producer;
  if expected_revision is distinct from coalesce(rev,0) then raise exception 'Dues settings changed. Reload before saving'; end if;
  if allocation>0 and not exists(select 1 from public.producer_funds where id=target_fund and producer_id=target_producer and is_active) then raise exception 'Choose an active producer fund'; end if;
  insert into public.producer_dues_settings(producer_id,amount_cents,installments,allocation_mode,allocation_value,fund_id)
    values(target_producer,amount,allow_installments,mode,allocation,target_fund)
  on conflict(producer_id) do update set amount_cents=excluded.amount_cents,installments=excluded.installments,
    allocation_mode=excluded.allocation_mode,allocation_value=excluded.allocation_value,fund_id=excluded.fund_id,revision=producer_dues_settings.revision+1
  returning revision into rev;
  return rev;
end $$;

create function public.assess_membership_dues(target_producer uuid,target_member uuid,target_season uuid,target_fund uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare settings public.producer_dues_settings%rowtype; account uuid; contribution bigint;
begin
  if not public.can_manage_finances(target_producer) then raise exception 'Finance access is required'; end if;
  perform 1 from public.producers where id=target_producer for update;
  select * into settings from public.producer_dues_settings where producer_id=target_producer;
  if not found then raise exception 'Set up membership dues first'; end if;
  contribution:=case when settings.allocation_mode='fixed' then settings.allocation_value else round(settings.amount_cents::numeric*settings.allocation_value/10000)::bigint end;
  if contribution>0 and not exists(select 1 from public.producer_funds where id=target_fund and producer_id=target_producer and is_active) then raise exception 'Choose an active producer fund'; end if;
  if exists(select 1 from public.membership_dues where membership_id=target_member and season_id=target_season) then raise exception 'This member already has dues for this season'; end if;
  insert into public.membership_dues(producer_id,membership_id,season_id,amount_cents,installments,allocation_cents,fund_id)
    values(target_producer,target_member,target_season,settings.amount_cents,settings.installments,contribution,case when contribution>0 then target_fund end) returning id into account;
  return account;
end $$;

create function public.record_dues_payment(target_producer uuid,target_dues uuid,reference uuid,amount bigint,payment_method text,note text,reversal uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare account public.membership_dues%rowtype; original public.membership_dues_payments%rowtype; existing public.membership_dues_payments%rowtype;
  paid bigint; delta bigint; signed_amount bigint; available bigint; label text;
begin
  if not public.can_manage_finances(target_producer) then raise exception 'Finance access is required'; end if;
  select * into account from public.membership_dues where id=target_dues and producer_id=target_producer for update;
  if not found then raise exception 'Membership dues not found'; end if;
  if reference is null or length(trim(coalesce(note,''))) not between 5 and 2000 then raise exception 'Provide a payment reference and reason'; end if;
  if reversal is not null then
    select * into original from public.membership_dues_payments where id=reversal and dues_id=account.id and amount_cents>0;
    if not found or payment_method is distinct from 'reversal' then raise exception 'Choose an original payment to reverse'; end if;
    signed_amount:=-original.amount_cents;
  else
    if payment_method is null or payment_method not in ('cash','check','card','other') or amount is null or amount<=0 or amount>2147483647 then raise exception 'Enter a positive payment and method'; end if;
    signed_amount:=amount;
  end if;
  select * into existing from public.membership_dues_payments where id=reference;
  if found then
    if existing.dues_id=account.id and existing.amount_cents=signed_amount and existing.method=payment_method and existing.reason=trim(note) and existing.reverses_id is not distinct from reversal then return reference; end if;
    raise exception 'This payment reference has already been used';
  end if;
  if reversal is not null and exists(select 1 from public.membership_dues_payments where reverses_id=reversal) then raise exception 'Payment already reversed'; end if;
  select coalesce(sum(amount_cents),0) into paid from public.membership_dues_payments where dues_id=account.id;
  if paid+signed_amount<0 or paid+signed_amount>account.amount_cents then raise exception 'Payment exceeds the dues balance'; end if;
  if signed_amount>0 and not account.installments and paid+signed_amount<>account.amount_cents then raise exception 'This membership requires full payment'; end if;
  -- Cumulative rounding makes all installments sum to exactly the configured allocation.
  delta:=round((paid+signed_amount)::numeric*account.allocation_cents/account.amount_cents)::bigint-round(paid::numeric*account.allocation_cents/account.amount_cents)::bigint;
  if delta<>0 then
    perform 1 from public.producer_funds where id=account.fund_id for update;
    if delta>0 and not exists(select 1 from public.producer_funds where id=account.fund_id and is_active) then raise exception 'Reactivate the destination fund before collecting dues'; end if;
    if delta<0 then
      select available_cents into available from public.producer_fund_availability(target_producer) where id=account.fund_id;
      if available+delta<0 then raise exception 'The fund has insufficient available money to reverse this contribution'; end if;
    end if;
  end if;
  label:=coalesce(auth.jwt()->>'email',auth.uid()::text);
  insert into public.membership_dues_payments(id,producer_id,dues_id,amount_cents,contributed_cents,method,reason,reverses_id,created_by,staff_label)
    values(reference,target_producer,account.id,signed_amount,delta,payment_method,trim(note),reversal,auth.uid(),label);
  if delta<>0 then
    insert into public.fund_transactions(producer_id,fund_id,kind,amount_cents,reason,dues_payment_id,created_by,staff_label)
    select target_producer,account.fund_id,case when delta>0 then 'membership_deposit' else 'membership_adjustment' end,delta,
      left('Membership dues: '||r.first_name||' '||r.last_name||' / '||s.name||' / '||trim(note),2000),reference,auth.uid(),label
    from public.memberships m join public.ropers r on r.id=m.roper_id join public.producer_seasons s on s.id=account.season_id where m.id=account.membership_id;
  end if;
  return reference;
end $$;
revoke all on function public.save_dues_settings(uuid,integer,bigint,boolean,text,bigint,uuid),public.assess_membership_dues(uuid,uuid,uuid,uuid),public.record_dues_payment(uuid,uuid,uuid,bigint,text,text,uuid) from public,anon;
grant execute on function public.save_dues_settings(uuid,integer,bigint,boolean,text,bigint,uuid),public.assess_membership_dues(uuid,uuid,uuid,uuid),public.record_dues_payment(uuid,uuid,uuid,bigint,text,text,uuid) to authenticated;
notify pgrst,'reload schema';
