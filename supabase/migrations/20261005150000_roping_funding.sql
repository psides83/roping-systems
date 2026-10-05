alter table public.event_ropings add column allow_pledged_sponsor_money boolean not null default false;
alter table public.event_ropings add column payouts_finalized_at timestamptz;
alter table public.event_ropings add column payouts_finalized_by uuid references auth.users(id);
create table public.roping_funding (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  event_roping_id uuid not null references public.event_ropings(id),
  source text not null check(source in ('fund','sponsor','other')),
  fund_id uuid,
  sponsor_name text not null default '',
  amount_cents integer not null check(amount_cents>0),
  received_cents integer not null default 0 check(received_cents>=0 and received_cents<=amount_cents),
  reason text not null check(length(trim(reason)) between 5 and 2000),
  cancelled_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users(id),
  foreign key(fund_id,producer_id) references public.producer_funds(id,producer_id),
  check((source='fund')=(fund_id is not null)),
  check(source<>'sponsor' or length(trim(sponsor_name)) between 1 and 200)
);
create index roping_funding_roping_idx on public.roping_funding(event_roping_id);
create index roping_funding_fund_idx on public.roping_funding(fund_id) where cancelled_at is null;
alter table public.roping_funding enable row level security;
create policy "Staff read roping funding" on public.roping_funding for select to authenticated using(public.has_organization_access(producer_id));
create trigger audit_roping_funding after insert or update or delete on public.roping_funding for each row execute function public.write_audit_log();
alter table public.fund_transactions add column funding_id uuid references public.roping_funding(id);
alter table public.fund_transactions drop constraint fund_transactions_kind_check;
alter table public.fund_transactions add constraint fund_transactions_kind_check check(kind in ('entry_deposit','entry_adjustment','manual_deposit','manual_debit','reversal','roping_allocation','roping_return'));
alter table public.fund_transactions drop constraint fund_transactions_check3;
alter table public.fund_transactions add constraint fund_transactions_check3 check((kind in ('entry_deposit','entry_adjustment','roping_allocation','roping_return'))=(event_roping_id is not null));
alter table public.fund_transactions add constraint funding_transaction_sign check((kind<>'roping_allocation' or amount_cents<0) and (kind<>'roping_return' or amount_cents>0));

create function public.fund_reserved_cents(target_fund_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(f.amount_cents),0)::bigint from public.roping_funding f join public.event_ropings r on r.id=f.event_roping_id
    where f.fund_id=target_fund_id and f.cancelled_at is null and r.payouts_finalized_at is null;
$$;
create function public.roping_added_money_cents(target_roping_id uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when f.source='sponsor' and not r.allow_pledged_sponsor_money then f.received_cents else f.amount_cents end),0)::bigint
  from public.roping_funding f join public.event_ropings r on r.id=f.event_roping_id where r.id=target_roping_id and f.cancelled_at is null;
$$;
create function public.producer_fund_availability(target_producer_id uuid)
returns table(id uuid,name text,description text,is_active boolean,balance_cents bigint,reserved_cents bigint,available_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_organization_access(target_producer_id) then raise exception 'Producer access is required'; end if;
  return query select b.id,b.name,b.description,b.is_active,b.balance_cents,public.fund_reserved_cents(b.id),b.balance_cents-public.fund_reserved_cents(b.id)
    from public.producer_fund_balances(target_producer_id) b;
end;
$$;

create function public.save_roping_funding(target_roping_id uuid,target_funding_id uuid,target_source text,target_fund_id uuid,
  target_sponsor_name text,target_amount_cents integer,target_received_cents integer,target_reason text,target_cancel boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.event_ropings%rowtype; old_funding public.roping_funding%rowtype; f public.producer_funds%rowtype; balance bigint; reserved bigint; selected_id uuid;
begin
  perform 1 from public.events where id=(select event_id from public.event_ropings where id=target_roping_id) for update;
  select * into r from public.event_ropings where id=target_roping_id for update;
  if not found or auth.uid() is null or not public.can_manage_organization(r.producer_id) then raise exception 'Manager access is required'; end if;
  select * into old_funding from public.roping_funding where id=target_funding_id;
  if old_funding.id is not null and old_funding.event_roping_id<>r.id then raise exception 'Funding record not found'; end if;
  if r.payouts_finalized_at is not null then
    if not target_cancel and old_funding.id is not null and old_funding.cancelled_at is null and old_funding.source='sponsor' and r.allow_pledged_sponsor_money
      and target_source=old_funding.source and target_fund_id is null and target_amount_cents=old_funding.amount_cents
      and trim(target_sponsor_name)=old_funding.sponsor_name and target_received_cents between old_funding.received_cents and old_funding.amount_cents then
      update public.roping_funding set received_cents=target_received_cents where id=old_funding.id;
      return old_funding.id;
    end if;
    raise exception 'Reopen payouts before changing funding';
  end if;
  if exists(select 1 from public.payout_receipt_awards a join public.payout_receipts p on p.id=a.receipt_id where a.event_roping_id=r.id and p.reversed_at is null) then
    raise exception 'Reverse recorded payouts before changing funding'; end if;
  if target_funding_id is null or target_cancel is null or length(trim(coalesce(target_reason,''))) not between 5 and 2000 then raise exception 'Provide a clearly explained reason'; end if;
  -- Serialize reservation changes across both the old and new accounts.
  for selected_id in select distinct value from unnest(array[old_funding.fund_id,target_fund_id]) value where value is not null order by value loop
    perform 1 from public.producer_funds where id=selected_id for update;
  end loop;
  if target_cancel then
    if old_funding.id is null then raise exception 'Funding record not found'; end if;
    update public.roping_funding set cancelled_at=coalesce(cancelled_at,now()),reason=trim(target_reason) where id=old_funding.id;
  else
    if old_funding.cancelled_at is not null then raise exception 'This contribution was cancelled. Add a new contribution'; end if;
    if target_source is null or target_source not in ('fund','sponsor','other') or target_amount_cents is null or target_amount_cents<=0
      or target_received_cents is null or target_received_cents<0 or target_received_cents>target_amount_cents then raise exception 'Enter valid funding amounts'; end if;
    if target_source='sponsor' and nullif(trim(target_sponsor_name),'') is null then raise exception 'Provide the sponsor name'; end if;
    if target_source='fund' then
      select * into f from public.producer_funds where id=target_fund_id and producer_id=r.producer_id and is_active;
      if not found then raise exception 'Choose an active producer fund'; end if;
      select coalesce(sum(amount_cents),0) into balance from public.fund_transactions where fund_id=f.id;
      reserved:=public.fund_reserved_cents(f.id)-(case when old_funding.fund_id=f.id then old_funding.amount_cents else 0 end);
      if balance-reserved<target_amount_cents then raise exception 'Insufficient available fund balance'; end if;
    elsif target_fund_id is not null then raise exception 'Only fund contributions select a fund'; end if;
    if (public.roping_added_money_cents(r.id)-(case when old_funding.id is null then 0 when old_funding.source='sponsor' and not r.allow_pledged_sponsor_money then old_funding.received_cents else old_funding.amount_cents end)
      +target_amount_cents)>2147483647 then raise exception 'Added money exceeds the supported payout amount'; end if;
    insert into public.roping_funding(id,producer_id,event_roping_id,source,fund_id,sponsor_name,amount_cents,received_cents,reason,created_by)
      values(target_funding_id,r.producer_id,r.id,target_source,target_fund_id,coalesce(trim(target_sponsor_name),''),target_amount_cents,
        case when target_source='sponsor' then target_received_cents else target_amount_cents end,trim(target_reason),auth.uid())
      on conflict(id) do update set source=excluded.source,fund_id=excluded.fund_id,sponsor_name=excluded.sponsor_name,
        amount_cents=excluded.amount_cents,received_cents=excluded.received_cents,reason=excluded.reason;
  end if;
  update public.event_roping_payout_plans set added_money_cents=public.roping_added_money_cents(r.id)::integer where event_roping_id=r.id and pool_type='main';
  return target_funding_id;
end;
$$;

create function public.set_roping_sponsor_policy(target_roping_id uuid,target_allow_pledged boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.event_ropings%rowtype;
begin
  perform 1 from public.events where id=(select event_id from public.event_ropings where id=target_roping_id) for update;
  select * into r from public.event_ropings where id=target_roping_id for update;
  if not found or auth.uid() is null or not public.can_manage_organization(r.producer_id) then raise exception 'Manager access is required'; end if;
  if r.payouts_finalized_at is not null then raise exception 'Reopen payouts before changing sponsor policy'; end if;
  if exists(select 1 from public.payout_receipt_awards a join public.payout_receipts p on p.id=a.receipt_id where a.event_roping_id=r.id and p.reversed_at is null) then raise exception 'Reverse recorded payouts before changing sponsor policy'; end if;
  if target_allow_pledged is null then raise exception 'Choose a sponsor policy'; end if;
  update public.event_ropings set allow_pledged_sponsor_money=target_allow_pledged where id=r.id;
  update public.event_roping_payout_plans set added_money_cents=public.roping_added_money_cents(r.id)::integer where event_roping_id=r.id and pool_type='main';
end;
$$;

create function public.finalize_roping_payouts(target_roping_id uuid,target_reopen boolean,target_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare r public.event_ropings%rowtype; funding public.roping_funding%rowtype; selected_id uuid; balance bigint; awards bigint;
begin
  perform 1 from public.events where id=(select event_id from public.event_ropings where id=target_roping_id) for update;
  select * into r from public.event_ropings where id=target_roping_id for update;
  if not found or auth.uid() is null or not public.can_manage_organization(r.producer_id) then raise exception 'Manager access is required'; end if;
  if target_reopen is null or length(trim(coalesce(target_reason,''))) not between 5 and 2000 then raise exception 'Provide a finalization or reopening reason'; end if;
  if target_reopen and exists(select 1 from public.payout_receipt_awards a join public.payout_receipts p on p.id=a.receipt_id where a.event_roping_id=r.id and p.reversed_at is null) then
    raise exception 'Reverse recorded payouts before reopening payouts'; end if;
  if target_reopen and r.payouts_finalized_at is null then raise exception 'Payouts are not finalized'; end if;
  if not target_reopen and r.payouts_finalized_at is not null then return; end if;
  perform 1 from public.roping_entries where event_roping_id=r.id for update;
  perform 1 from public.competition_runs where event_roping_id=r.id for update;
  if not target_reopen then
    if r.event_day_status<>'completed' then raise exception 'Complete this roping before finalizing payouts'; end if;
    if exists(select 1 from public.competition_runs run join public.roping_entries e on e.id=run.entry_id
      where run.event_roping_id=r.id and e.competition_status='active' and run.status in ('pending','rerun')) then raise exception 'Resolve every remaining run before finalizing payouts'; end if;
    if not exists(select 1 from public.event_roping_payout_plans where event_roping_id=r.id and pool_type='main') then raise exception 'A main payout schedule is required'; end if;
    if exists(select 1 from public.payout_disbursements d join public.event_roping_payout_plans p on p.id=d.payout_plan_id
      left join public.event_payout_register_awards(r.event_id) a on a.plan_id=d.payout_plan_id and a.award_key=d.award_key
      where p.event_roping_id=r.id and d.amount_cents>coalesce(a.payout_cents,0)) then raise exception 'Reconcile payouts that no longer match current winnings'; end if;
    select coalesce(sum(a.payout_cents),0) into awards from public.event_payout_register_awards(r.event_id) a where a.event_roping_id=r.id and a.pool_type='main';
    if public.roping_added_money_cents(r.id)>0 and awards=0 then raise exception 'No payable main-purse awards exist. Review results and payout schedules before using added money'; end if;
  end if;
  for selected_id in select distinct fund_id from public.roping_funding where event_roping_id=r.id and cancelled_at is null and fund_id is not null order by fund_id loop
    perform 1 from public.producer_funds where id=selected_id for update;
    if not target_reopen then
      select coalesce(sum(amount_cents),0) into balance from public.fund_transactions where fund_id=selected_id;
      if balance<public.fund_reserved_cents(selected_id) then raise exception 'A fund no longer covers its reservations. Reconcile its balance before finalizing'; end if;
    end if;
  end loop;
  for funding in select * from public.roping_funding where event_roping_id=r.id and source='fund' and cancelled_at is null loop
    insert into public.fund_transactions(producer_id,fund_id,kind,amount_cents,reason,event_roping_id,funding_id,created_by,staff_label)
      values(r.producer_id,funding.fund_id,case when target_reopen then 'roping_return' else 'roping_allocation' end,
        case when target_reopen then funding.amount_cents else -funding.amount_cents end,trim(target_reason),r.id,funding.id,auth.uid(),coalesce(auth.jwt()->>'email',auth.uid()::text));
  end loop;
  perform set_config('app.finalizing_payouts','on',true);
  update public.event_ropings set payouts_finalized_at=case when target_reopen then null else now() end,
    payouts_finalized_by=case when target_reopen then null else auth.uid() end where id=r.id;
  perform set_config('app.finalizing_payouts','off',true);
end;
$$;

-- Preserve previously declared roping money without attributing it to a fund.
insert into public.roping_funding(producer_id,event_roping_id,source,amount_cents,received_cents,reason)
  select producer_id,event_roping_id,'other',sum(added_money_cents)::integer,sum(added_money_cents)::integer,
    'Previously declared added money; verify its source.' from public.event_roping_payout_plans
    where pool_type='main' and added_money_cents>0 group by producer_id,event_roping_id;
update public.payout_schedules set default_added_money_cents=0 where default_added_money_cents<>0;
create function public.enforce_roping_added_money_plan() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.event_ropings r where r.id=new.event_roping_id and r.payouts_finalized_at is not null) then
    raise exception 'Reopen finalized payouts before changing their payout setup'; end if;
  new.added_money_cents:=case when new.pool_type='main' then public.roping_added_money_cents(new.event_roping_id)::integer else 0 end;
  return new;
end;
$$;
create trigger plans_enforce_roping_funding before insert or update on public.event_roping_payout_plans for each row execute function public.enforce_roping_added_money_plan();
create function public.enforce_zero_schedule_added_money() returns trigger language plpgsql set search_path = '' as $$
begin new.default_added_money_cents:=0; return new; end;
$$;
create trigger schedules_no_added_money before insert or update on public.payout_schedules for each row execute function public.enforce_zero_schedule_added_money();

create function public.guard_finalized_roping_record() returns trigger
language plpgsql security definer set search_path = '' as $$
declare roping_id uuid; plan_id uuid; row_json jsonb;
begin
  row_json:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  if tg_table_name='event_ropings' then
    if tg_op='UPDATE' and (new.payouts_finalized_at is distinct from old.payouts_finalized_at or new.payouts_finalized_by is distinct from old.payouts_finalized_by)
      and current_setting('app.finalizing_payouts',true) is distinct from 'on' then raise exception 'Use the payout finalization controls'; end if;
    if tg_op='UPDATE' and current_setting('app.finalizing_payouts',true)='on' then return new; end if;
    if tg_op='UPDATE' and old.payouts_finalized_at is not null and
      (to_jsonb(new)-array['result_status','event_day_note','event_day_updated_at','event_day_updated_by','updated_at']) is distinct from
      (to_jsonb(old)-array['result_status','event_day_note','event_day_updated_at','event_day_updated_by','updated_at']) then
      raise exception 'Reopen payouts before changing the finalized roping'; end if;
    if tg_op='DELETE' and old.payouts_finalized_at is not null then raise exception 'Finalized ropings cannot be deleted'; end if;
    return case when tg_op='DELETE' then old else new end;
  end if;
  if tg_table_name in ('competition_runs','roping_entries','event_roping_payout_plans','event_fees') then roping_id:=(row_json->>'event_roping_id')::uuid;
  elsif tg_table_name='entry_charges' then select event_roping_id into roping_id from public.event_fees where id=(row_json->>'event_fee_id')::uuid;
  elsif tg_table_name='event_roping_payout_brackets' then select event_roping_id into roping_id from public.event_roping_payout_plans where id=(row_json->>'payout_plan_id')::uuid;
  elsif tg_table_name='event_roping_payout_places' then
    select b.payout_plan_id into plan_id from public.event_roping_payout_brackets b where b.id=(row_json->>'payout_bracket_id')::uuid;
    select event_roping_id into roping_id from public.event_roping_payout_plans where id=plan_id;
  end if;
  if exists(select 1 from public.event_ropings where id=roping_id and payouts_finalized_at is not null) then
    raise exception 'Reopen payouts before changing finalized competition or payout data'; end if;
  if tg_op='UPDATE' and tg_table_name in ('competition_runs','roping_entries','entry_charges') then
    row_json:=to_jsonb(old);
    if tg_table_name='entry_charges' then select event_roping_id into roping_id from public.event_fees where id=(row_json->>'event_fee_id')::uuid;
    else roping_id:=(row_json->>'event_roping_id')::uuid; end if;
    if exists(select 1 from public.event_ropings where id=roping_id and payouts_finalized_at is not null) then raise exception 'Reopen payouts before moving finalized competition data'; end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger guard_finalized_roping before update or delete on public.event_ropings for each row execute function public.guard_finalized_roping_record();
create trigger guard_finalized_runs before insert or update or delete on public.competition_runs for each row execute function public.guard_finalized_roping_record();
create trigger guard_finalized_entries before insert or update or delete on public.roping_entries for each row execute function public.guard_finalized_roping_record();
create trigger guard_finalized_charges before insert or update or delete on public.entry_charges for each row execute function public.guard_finalized_roping_record();
create trigger guard_finalized_fees before insert or update or delete on public.event_fees for each row execute function public.guard_finalized_roping_record();
create trigger guard_finalized_plans before insert or update or delete on public.event_roping_payout_plans for each row execute function public.guard_finalized_roping_record();
create trigger guard_finalized_brackets before insert or update or delete on public.event_roping_payout_brackets for each row execute function public.guard_finalized_roping_record();
create trigger guard_finalized_places before insert or update or delete on public.event_roping_payout_places for each row execute function public.guard_finalized_roping_record();
create function public.require_finalized_payout_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists(select 1 from public.event_ropings where id=new.event_roping_id and payouts_finalized_at is not null) then
    raise exception 'Finalize payouts for this roping before recording a payout receipt'; end if;
  return new;
end;
$$;
create trigger receipts_require_finalized_roping before insert on public.payout_receipt_awards for each row execute function public.require_finalized_payout_receipt();

-- Template comparisons concern distribution rules, never a roping's funding amount.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.event_roping_template_snapshot(uuid,boolean)'::regprocedure) into definition;
  definition:=replace(definition,'''added_money_cents'', case when plan.main_pool then s.default_added_money_cents else 0 end','''funding_managed'', true');
  definition:=replace(definition,'''added_money_cents'', p.added_money_cents','''funding_managed'', true');
  execute definition;
  select pg_get_functiondef('public.record_fund_transaction(uuid,uuid,text,bigint,text,uuid)'::regprocedure) into definition;
  definition:=replace(definition,'balance + amount < 0','balance + amount - public.fund_reserved_cents(fund.id) < 0');
  definition:=replace(definition,'Insufficient fund balance','Insufficient available fund balance');
  execute definition;
end $$;
revoke all on function public.fund_reserved_cents(uuid),public.roping_added_money_cents(uuid),public.enforce_roping_added_money_plan(),public.enforce_zero_schedule_added_money() from public,anon,authenticated;
revoke all on function public.guard_finalized_roping_record(),public.require_finalized_payout_receipt() from public,anon,authenticated;
revoke all on function public.producer_fund_availability(uuid),public.save_roping_funding(uuid,uuid,text,uuid,text,integer,integer,text,boolean),public.set_roping_sponsor_policy(uuid,boolean),public.finalize_roping_payouts(uuid,boolean,text) from public,anon;
grant execute on function public.producer_fund_availability(uuid),public.save_roping_funding(uuid,uuid,text,uuid,text,integer,integer,text,boolean),public.set_roping_sponsor_policy(uuid,boolean),public.finalize_roping_payouts(uuid,boolean,text) to authenticated;
