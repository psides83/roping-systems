alter table public.roping_template_fees add column fund_tracking text
  check (fund_tracking in ('general','classification'));
alter table public.event_fees add column fund_tracking text
  check (fund_tracking in ('general','classification'));
alter table public.roping_template_fees add constraint template_added_money_rules check (
  (kind = 'added_money' and fund_tracking is not null and scope = 'entry' and is_required and not contributes_to_payout and payout_schedule_id is null)
  or (kind <> 'added_money' and fund_tracking is null));
alter table public.event_fees add constraint event_added_money_rules check (
  (kind = 'added_money' and fund_tracking is not null and scope = 'entry' and is_required and not contributes_to_payout)
  or (kind <> 'added_money' and fund_tracking is null));

create function public.copy_added_money_fee_settings() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.kind = 'added_money' then
    select fund_tracking into new.fund_tracking from public.roping_template_fees
      where id = new.roping_template_fee_id and producer_id = new.producer_id;
    if new.fund_tracking is null then raise exception 'Choose added-money fund tracking on the source template fee'; end if;
  else new.fund_tracking := null;
  end if;
  return new;
end;
$$;
create trigger event_fees_copy_fund_settings before insert or update on public.event_fees
  for each row execute function public.copy_added_money_fee_settings();
revoke all on function public.copy_added_money_fee_settings() from public, anon, authenticated;

alter table public.entry_charges add column added_money_fund_key text;
alter table public.entry_charges add column added_money_fund_label text;
alter table public.entry_charges add column added_money_roping_date date;
create index entry_charges_added_money_idx on public.entry_charges(producer_id,added_money_roping_date)
  where added_money_fund_key is not null;
create function public.snapshot_added_money_charge() returns trigger
language plpgsql security definer set search_path = '' as $$
declare fee public.event_fees%rowtype; roping public.event_ropings%rowtype; division_name text; class_name text;
begin
  if tg_op = 'UPDATE' then
    new.added_money_fund_key := old.added_money_fund_key;
    new.added_money_fund_label := old.added_money_fund_label;
    new.added_money_roping_date := old.added_money_roping_date;
    return new;
  end if;
  select * into fee from public.event_fees where id = new.event_fee_id and producer_id = new.producer_id;
  new.added_money_fund_key := null; new.added_money_fund_label := null; new.added_money_roping_date := null;
  if fee.kind <> 'added_money' or fee.id is null then return new; end if;
  select * into roping from public.event_ropings where id = fee.event_roping_id and producer_id = new.producer_id;
  if roping.id is null or new.entry_id is null then raise exception 'Added-money contributions require a roping entry'; end if;
  new.added_money_roping_date := roping.scheduled_date;
  if fee.fund_tracking = 'general' then
    new.added_money_fund_key := 'general'; new.added_money_fund_label := 'General added money';
  else
    select name into division_name from public.divisions where id = roping.division_id;
    select name into class_name from public.classifications where id = roping.classification_id;
    new.added_money_fund_key := roping.division_id::text || ':' || case when roping.competition_format = 'handicap' then 'handicap'
      else coalesce(roping.classification_id::text,roping.competition_format::text) end;
    new.added_money_fund_label := coalesce(division_name,'Roping') || ' / ' || case when roping.competition_format = 'handicap' then 'Handicap'
      else coalesce(class_name,case when roping.competition_format = 'four_d' then '4-D' else 'Open' end) end;
  end if;
  return new;
end;
$$;
create trigger entry_charges_snapshot_added_money before insert or update on public.entry_charges
  for each row execute function public.snapshot_added_money_charge();
revoke all on function public.snapshot_added_money_charge() from public, anon, authenticated;

-- Include fund routing in template comparisons and template duplication.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.event_roping_template_snapshot(uuid,boolean)'::regprocedure) into definition;
  if position('''sort_order'', f.sort_order, ''kind'', f.kind' in definition) = 0 then raise exception 'Unexpected fee snapshot definition'; end if;
  definition := replace(definition,'''sort_order'', f.sort_order, ''kind'', f.kind', '''sort_order'', f.sort_order, ''kind'', f.kind, ''fund_tracking'', f.fund_tracking');
  execute definition;
  select pg_get_functiondef('public.duplicate_division_template(uuid,uuid)'::regprocedure) into definition;
  if position('kind, payout_schedule_id' in definition) = 0 then raise exception 'Unexpected template duplication definition'; end if;
  definition := replace(definition,'kind, payout_schedule_id','kind, payout_schedule_id, fund_tracking');
  execute definition;
end $$;

create function public.producer_added_money_contributions(target_producer_id uuid, target_start date, target_end date)
returns table(fund_key text,fund_label text,event_id uuid,event_title text,roping_date date,fee_title text,
  paid_entries bigint,collected_cents bigint,pending_entries bigint,pending_cents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_organization_access(target_producer_id) then
    raise exception 'Producer access is required'; end if;
  if target_start is not null and target_end is not null and target_end < target_start then raise exception 'Choose a valid date range'; end if;
  return query
  select c.added_money_fund_key,max(c.added_money_fund_label),e.id,e.title,c.added_money_roping_date,c.title,
    count(*) filter(where entry.payment_status = 'paid_cash'),
    coalesce(sum(c.amount_cents) filter(where entry.payment_status = 'paid_cash'),0)::bigint,
    count(*) filter(where entry.payment_status = 'unpaid' and entry.competition_status = 'active'),
    coalesce(sum(c.amount_cents) filter(where entry.payment_status = 'unpaid' and entry.competition_status = 'active'),0)::bigint
  from public.entry_charges c join public.roping_entries entry on entry.id = c.entry_id and entry.producer_id = c.producer_id
    join public.events e on e.id = c.event_id and e.producer_id = c.producer_id
  where c.producer_id = target_producer_id and c.added_money_fund_key is not null and c.waived_at is null
    and entry.payment_status in ('paid_cash','unpaid')
    and (target_start is null or c.added_money_roping_date >= target_start)
    and (target_end is null or c.added_money_roping_date <= target_end)
  group by c.added_money_fund_key,e.id,e.title,c.added_money_roping_date,c.title
  order by c.added_money_roping_date desc,e.title,c.title;
end;
$$;
revoke all on function public.producer_added_money_contributions(uuid,date,date) from public, anon;
grant execute on function public.producer_added_money_contributions(uuid,date,date) to authenticated;
