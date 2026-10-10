create table public.event_stock_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  producer_id uuid not null references public.producers(id),
  enabled boolean not null default false,
  run_limit integer check(run_limit between 1 and 1000),
  score_limit integer check(score_limit between 1 and 1000)
);
create table public.event_stock_packages (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  producer_id uuid not null references public.producers(id),
  title text not null check(length(trim(title)) between 1 and 100),
  kind text not null check(kind in ('run','score')),
  units integer not null check(units between 1 and 1000),
  amount_cents integer not null check(amount_cents between 1 and 100000000),
  active boolean not null default true
);
create table public.event_stock_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  producer_id uuid not null references public.producers(id),
  title text not null check(length(trim(title)) between 1 and 100),
  scheduled_date date not null,
  arena_name text not null,
  start_time time,
  follows_roping_id uuid references public.event_ropings(id) on delete restrict,
  note text not null default '',
  active boolean not null default true,
  check((start_time is null) <> (follows_roping_id is null))
);
create table public.event_stock_purchases (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  producer_id uuid not null references public.producers(id),
  roper_id uuid not null references public.ropers(id),
  package_id uuid not null references public.event_stock_packages(id),
  title text not null,
  kind text not null check(kind in ('run','score')),
  units integer not null check(units > 0),
  amount_cents integer not null check(amount_cents > 0),
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  cancelled_at timestamptz,
  correction_reason text
);
create table public.event_stock_payments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  producer_id uuid not null references public.producers(id),
  purchase_id uuid not null unique references public.event_stock_purchases(id),
  amount_cents integer not null check(amount_cents > 0),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  voided_at timestamptz,
  correction_reason text
);
create table public.event_stock_uses (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  producer_id uuid not null references public.producers(id),
  purchase_id uuid not null references public.event_stock_purchases(id),
  session_id uuid not null references public.event_stock_sessions(id),
  request_id uuid not null unique,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  reversed_at timestamptz,
  correction_reason text
);
create index stock_purchases_roper on public.event_stock_purchases(event_id,roper_id,kind);
create index stock_uses_purchase on public.event_stock_uses(purchase_id) where reversed_at is null;
do $$ declare t text; begin
  foreach t in array array['event_stock_settings','event_stock_packages','event_stock_sessions','event_stock_purchases','event_stock_payments','event_stock_uses'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy stock_staff_read on public.%I for select to authenticated using(public.can_manage_event(event_id) or public.can_enter_event(event_id) or public.can_finance_event(event_id))',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;

-- All mutations serialize on the event. Client retries carry an idempotency key.
create function public.manage_event_stock(target_event uuid, operation text, payload jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; p public.event_stock_packages%rowtype;
  purchase public.event_stock_purchases%rowtype; config public.event_stock_settings%rowtype;
  session public.event_stock_sessions%rowtype; target uuid; roper uuid; limit_units integer;
  total_units bigint; result uuid; reason text; request uuid; changed integer;
begin
  select * into e from public.events where id=target_event for update;
  if e.id is null or auth.uid() is null then raise exception 'Event access is required'; end if;
  if operation in ('settings','package','session') then
    if not public.can_manage_event(e.id) then raise exception 'Event management access is required'; end if;
  elsif operation in ('cancel','reverse') then
    if not public.can_adjust_event_finances(e.id) then raise exception 'Financial correction access is required'; end if;
  elsif operation='pay' then
    if not public.can_collect_event(e.id) then raise exception 'Payment collection access is required'; end if;
  elsif operation in ('purchase','use') then
    if not (public.can_enter_event(e.id) or public.can_manage_event(e.id)) then raise exception 'Entry office access is required'; end if;
  else raise exception 'Unknown stock charge action'; end if;
  target:=nullif(payload->>'id','')::uuid;
  reason:=trim(coalesce(payload->>'reason',''));
  if operation in ('cancel','reverse') and length(reason)<5 then raise exception 'Explain the correction (at least 5 characters)'; end if;
  if operation='settings' then
    insert into public.event_stock_settings(event_id,producer_id,enabled,run_limit,score_limit)
      values(e.id,e.producer_id,(payload->>'enabled')::boolean,nullif(payload->>'runLimit','')::integer,nullif(payload->>'scoreLimit','')::integer)
      on conflict(event_id) do update set enabled=excluded.enabled,run_limit=excluded.run_limit,score_limit=excluded.score_limit;
    result:=e.id;
  elsif operation='package' then
    if target is null then
      insert into public.event_stock_packages(event_id,producer_id,title,kind,units,amount_cents)
      values(e.id,e.producer_id,trim(payload->>'title'),payload->>'kind',(payload->>'units')::integer,(payload->>'amountCents')::integer) returning id into result;
    else
      update public.event_stock_packages set active=(payload->>'active')::boolean where id=target and event_id=e.id returning id into result;
      if result is null then raise exception 'Package not found'; end if;
    end if;
  elsif operation='session' then
    if target is not null then
      update public.event_stock_sessions set active=(payload->>'active')::boolean where id=target and event_id=e.id returning id into result;
      if result is null then raise exception 'Session not found'; end if;
    else
      if (payload->>'date')::date < (e.starts_at at time zone (select timezone from public.producers where id=e.producer_id))::date
        or (payload->>'date')::date > (coalesce(e.ends_at,e.starts_at) at time zone (select timezone from public.producers where id=e.producer_id))::date then raise exception 'Choose a date within the event'; end if;
      if not exists(select 1 from generate_series(1,e.arena_count) n where 'Arena '||n=payload->>'arena') then raise exception 'Choose an event arena'; end if;
      if nullif(payload->>'follows','') is not null and not exists(select 1 from public.event_ropings r where r.id=(payload->>'follows')::uuid and r.event_id=e.id and r.scheduled_date=(payload->>'date')::date and r.arena_name=payload->>'arena') then raise exception 'Choose a roping on the same date and arena'; end if;
      insert into public.event_stock_sessions(event_id,producer_id,title,scheduled_date,arena_name,start_time,follows_roping_id,note)
      values(e.id,e.producer_id,trim(payload->>'title'),(payload->>'date')::date,payload->>'arena',nullif(payload->>'time','')::time,nullif(payload->>'follows','')::uuid,left(coalesce(payload->>'note',''),1000)) returning id into result;
    end if;
  elsif operation='purchase' then
    request:=(payload->>'requestId')::uuid;
    if request is null then raise exception 'A purchase request ID is required'; end if;
    select id into result from public.event_stock_purchases where request_id=request and event_id=e.id and created_by=auth.uid();
    if result is not null then return result; end if;
    select * into config from public.event_stock_settings where event_id=e.id;
    if not coalesce(config.enabled,false) or e.status in ('completed','cancelled') then raise exception 'Stock charge sales are not open'; end if;
    select * into p from public.event_stock_packages where id=(payload->>'packageId')::uuid and event_id=e.id and active;
    if p.id is null then raise exception 'Choose an available package'; end if;
    roper:=nullif(payload->>'roperId','')::uuid;
    if roper is null then
      if length(trim(coalesce(payload->>'firstName','')))=0 or length(trim(coalesce(payload->>'lastName','')))=0 or length(regexp_replace(coalesce(payload->>'phone',''),'[^0-9]','','g'))<>10 then raise exception 'Enter a first name, last name and 10-digit phone'; end if;
      insert into public.ropers(first_name,last_name,phone) values(trim(payload->>'firstName'),trim(payload->>'lastName'),regexp_replace(payload->>'phone','[^0-9]','','g')) returning id into roper;
      insert into public.memberships(producer_id,roper_id,member_number,status,joined_on,formally_approved)
      values(e.producer_id,roper,'R-'||replace(roper::text,'-',''),case when public.requires_membership(e.producer_id) then 'pending'::public.membership_status else 'active'::public.membership_status end,current_date,false);
    elsif not exists(select 1 from public.memberships where producer_id=e.producer_id and roper_id=roper) then raise exception 'Choose a roper from this producer'; end if;
    limit_units:=case when p.kind='run' then config.run_limit else config.score_limit end;
    select coalesce(sum(units),0) into total_units from public.event_stock_purchases where event_id=e.id and roper_id=roper and kind=p.kind and cancelled_at is null;
    if limit_units is not null and total_units+p.units>limit_units then raise exception 'This package exceeds the roper''s % limit',p.kind; end if;
    insert into public.event_stock_purchases(event_id,producer_id,roper_id,package_id,title,kind,units,amount_cents,request_id,created_by)
      values(e.id,e.producer_id,roper,p.id,p.title,p.kind,p.units,p.amount_cents,request,auth.uid()) returning id into result;
  elsif operation in ('pay','use','cancel') then
    select * into purchase from public.event_stock_purchases where id=target and event_id=e.id for update;
    if purchase.id is null then raise exception 'Purchase not found'; end if;
    if operation='cancel' then
      if exists(select 1 from public.event_stock_uses where purchase_id=target and reversed_at is null) then raise exception 'Reverse used units before canceling'; end if;
      update public.event_stock_purchases set cancelled_at=now(),correction_reason=reason where id=target and cancelled_at is null;
      get diagnostics changed=row_count;
      if changed=0 then raise exception 'Purchase already canceled'; end if;
      update public.event_stock_payments set voided_at=now(),correction_reason=reason where purchase_id=target and voided_at is null;
      result:=target;
    else
      if purchase.cancelled_at is not null then raise exception 'Purchase is canceled'; end if;
      if operation='pay' then
        insert into public.event_stock_payments(event_id,producer_id,purchase_id,amount_cents,created_by)
        values(e.id,e.producer_id,target,purchase.amount_cents,auth.uid()) on conflict(purchase_id) do nothing;
        result:=target;
      else
        request:=(payload->>'requestId')::uuid;
        if request is null then raise exception 'A usage request ID is required'; end if;
        select id into result from public.event_stock_uses where request_id=request and purchase_id=target and created_by=auth.uid();
        if result is not null then return result; end if;
        select * into config from public.event_stock_settings where event_id=e.id;
        if not coalesce(config.enabled,false) or e.status in ('completed','cancelled') then raise exception 'Stock charge runs are not open'; end if;
        if not exists(select 1 from public.event_stock_payments where purchase_id=target and voided_at is null and amount_cents=purchase.amount_cents) then raise exception 'Collect payment before using a run or score'; end if;
        select * into session from public.event_stock_sessions where id=(payload->>'sessionId')::uuid and event_id=e.id and active;
        if session.id is null then raise exception 'Choose an active session'; end if;
        if (select count(*) from public.event_stock_uses where purchase_id=target and reversed_at is null)>=purchase.units then raise exception 'All units have been used'; end if;
        insert into public.event_stock_uses(event_id,producer_id,purchase_id,session_id,request_id,created_by)
        values(e.id,e.producer_id,target,session.id,request,auth.uid()) returning id into result;
      end if;
    end if;
  elsif operation='reverse' then
    update public.event_stock_uses set reversed_at=now(),correction_reason=reason where id=target and event_id=e.id and reversed_at is null returning id into result;
    if result is null then raise exception 'Usage not found or already reversed'; end if;
  end if;
  insert into public.producer_audit_log(producer_id,actor_user_id,entity_type,entity_id,action,after_data)
    values(e.producer_id,auth.uid(),'event_stock',result,'update',jsonb_build_object('operation',operation,'event_id',e.id,'reason',reason));
  return result;
end $$;
revoke all on function public.manage_event_stock(uuid,text,jsonb) from public,anon;
grant execute on function public.manage_event_stock(uuid,text,jsonb) to authenticated;

alter function public.event_fee_collection_summary(uuid) rename to competition_fee_collection_summary;
revoke all on function public.competition_fee_collection_summary(uuid) from authenticated;
create function public.event_fee_collection_summary(target_event_id uuid)
returns table(fee_id uuid,title text,event_roping_id uuid,roping_name text,kind text,contributes_to_payout boolean,
 assessed_cents bigint,waived_cents bigint,collected_cents bigint,outstanding_cents bigint,charge_count bigint,partial_payments boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  -- The existing summary also checks producer access before returning any rows.
  return query select * from public.competition_fee_collection_summary(target_event_id);
  return query select p.package_id,p.title,null::uuid,null::text,'stock_charge_'||p.kind,false,
    sum(p.amount_cents)::bigint,0::bigint,coalesce(sum(pay.amount_cents),0)::bigint,
    (sum(p.amount_cents)-coalesce(sum(pay.amount_cents),0))::bigint,count(*)::bigint,false
  from public.event_stock_purchases p left join public.event_stock_payments pay on pay.purchase_id=p.id and pay.voided_at is null
  where p.event_id=target_event_id and p.cancelled_at is null group by p.package_id,p.title,p.kind;
end $$;
revoke all on function public.event_fee_collection_summary(uuid) from public,anon;
grant execute on function public.event_fee_collection_summary(uuid) to authenticated;
