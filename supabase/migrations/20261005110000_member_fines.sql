create table public.member_fines (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  membership_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  reason text not null check (length(trim(reason)) between 5 and 2000),
  restriction text not null check (restriction in ('none','entry','competition','both')),
  exempt_roping_ids uuid[] not null default '{}',
  issued_at timestamptz not null default now(),
  issued_by uuid references auth.users(id),
  issued_by_label text not null,
  foreign key (membership_id, producer_id) references public.memberships(id, producer_id)
);
create index member_fines_membership_idx on public.member_fines(membership_id, issued_at desc);
create table public.member_fine_transactions (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  fine_id uuid not null references public.member_fines(id),
  kind text not null check (kind in ('payment','waiver','reversal')),
  amount_cents integer not null check (amount_cents > 0),
  reason text not null check (length(trim(reason)) between 5 and 2000),
  reverses_id uuid unique references public.member_fine_transactions(id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  staff_label text not null,
  check ((kind = 'reversal') = (reverses_id is not null))
);
create index member_fine_transactions_fine_idx on public.member_fine_transactions(fine_id);
create table public.member_fine_exceptions (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  fine_id uuid not null references public.member_fines(id),
  event_roping_id uuid references public.event_ropings(id),
  expires_at timestamptz not null,
  reason text not null check (length(trim(reason)) between 5 and 2000),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  staff_label text not null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  revocation_reason text,
  check ((revoked_at is null) = (revocation_reason is null))
);
create index member_fine_exceptions_fine_idx on public.member_fine_exceptions(fine_id);

create function public.can_read_member_fines(target_membership_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.memberships m join public.ropers r on r.id = m.roper_id
    where m.id = target_membership_id and (public.has_organization_access(m.producer_id) or r.auth_user_id = auth.uid()));
$$;
revoke all on function public.can_read_member_fines(uuid) from public, anon;
grant execute on function public.can_read_member_fines(uuid) to authenticated;
alter table public.member_fines enable row level security;
alter table public.member_fine_transactions enable row level security;
alter table public.member_fine_exceptions enable row level security;
create policy "Staff and affected members can read fines" on public.member_fines for select to authenticated
  using(public.can_read_member_fines(membership_id));
create policy "Staff and affected members can read fine transactions" on public.member_fine_transactions for select to authenticated
  using(exists(select 1 from public.member_fines f where f.id = fine_id));
create policy "Staff and affected members can read fine exceptions" on public.member_fine_exceptions for select to authenticated
  using(exists(select 1 from public.member_fines f where f.id = fine_id));
create trigger audit_member_fines after insert or update or delete on public.member_fines for each row execute function public.write_audit_log();
create trigger audit_member_fine_transactions after insert or update or delete on public.member_fine_transactions for each row execute function public.write_audit_log();
create trigger audit_member_fine_exceptions after insert or update or delete on public.member_fine_exceptions for each row execute function public.write_audit_log();

create function public.member_fine_balance(target_fine_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select f.amount_cents - coalesce(sum(case when t.kind = 'reversal' then -t.amount_cents else t.amount_cents end),0)
  from public.member_fines f left join public.member_fine_transactions t on t.fine_id = f.id
  where f.id = target_fine_id group by f.id;
$$;
revoke all on function public.member_fine_balance(uuid) from public, anon, authenticated;

create function public.issue_member_fine(target_membership_id uuid, target_amount_cents integer,
  target_reason text, target_restriction text, target_origin_roping_id uuid, target_fine_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare m public.memberships%rowtype; exemptions uuid[];
begin
  select * into m from public.memberships where id = target_membership_id for update;
  if m.id is null or auth.uid() is null or not public.can_manage_organization(m.producer_id) then
    raise exception 'You do not have permission to issue this fine'; end if;
  if target_amount_cents is null or target_amount_cents <= 0 or target_fine_id is null
    or target_restriction is null or target_restriction not in ('none','entry','competition','both')
    or length(trim(coalesce(target_reason,''))) not between 5 and 2000 then
    raise exception 'Enter an amount, restriction, and clearly explained reason'; end if;
  if target_origin_roping_id is not null and not exists(select 1 from public.roping_entries e
    where e.roper_id = m.roper_id and e.producer_id = m.producer_id and e.event_roping_id = target_origin_roping_id) then
    raise exception 'Choose a roping entered by this member'; end if;
  if exists(select 1 from public.member_fines where id = target_fine_id) then
    if exists(select 1 from public.member_fines where id = target_fine_id and membership_id = m.id
      and amount_cents = target_amount_cents and reason = trim(target_reason) and restriction = target_restriction) then return target_fine_id; end if;
    raise exception 'This fine reference has already been used'; end if;
  select coalesce(array_agg(distinct r.id),'{}') into exemptions
  from public.event_ropings r join public.roping_entries e on e.event_roping_id = r.id
  where e.roper_id = m.roper_id and e.producer_id = m.producer_id
    and (r.id = target_origin_roping_id or r.event_day_status = 'in_progress'
      or (r.event_day_status in ('holding','delayed') and exists(select 1 from public.competition_runs cr
        where cr.event_roping_id = r.id and cr.status in ('complete','no_time','turned_out','disqualified'))));
  insert into public.member_fines(id,producer_id,membership_id,amount_cents,reason,restriction,exempt_roping_ids,issued_by,issued_by_label)
  values(target_fine_id,m.producer_id,m.id,target_amount_cents,trim(target_reason),target_restriction,exemptions,auth.uid(),coalesce(auth.jwt()->>'email',auth.uid()::text));
  return target_fine_id;
end;
$$;

create function public.record_member_fine_transaction(target_fine_id uuid, target_kind text,
  target_amount_cents integer, target_reason text, target_reverses_id uuid, target_transaction_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare f public.member_fines%rowtype; original public.member_fine_transactions%rowtype; amount integer; balance bigint;
begin
  select * into f from public.member_fines where id = target_fine_id for update;
  if f.id is null or auth.uid() is null or not public.can_manage_organization(f.producer_id) then
    raise exception 'You do not have permission to change this fine'; end if;
  if target_transaction_id is null or target_kind is null or target_kind not in ('payment','waiver','reversal')
    or length(trim(coalesce(target_reason,''))) not between 5 and 2000 then
    raise exception 'Provide a clearly explained reason for this change'; end if;
  if exists(select 1 from public.member_fine_transactions where id = target_transaction_id) then
    if exists(select 1 from public.member_fine_transactions where id = target_transaction_id and fine_id = f.id
      and kind = target_kind and reason = trim(target_reason) and reverses_id is not distinct from target_reverses_id
      and (target_kind = 'reversal' or amount_cents = target_amount_cents)) then return target_transaction_id; end if;
    raise exception 'This transaction reference has already been used'; end if;
  balance := public.member_fine_balance(f.id);
  if target_kind = 'reversal' then
    select * into original from public.member_fine_transactions where id = target_reverses_id and fine_id = f.id;
    if original.id is null or original.kind = 'reversal' or exists(select 1 from public.member_fine_transactions where reverses_id = original.id) then
      raise exception 'Choose an unreversed payment or waiver'; end if;
    amount := original.amount_cents;
    if balance + amount > f.amount_cents then raise exception 'The reversal exceeds the original fine'; end if;
  else
    amount := target_amount_cents;
    if amount is null or amount <= 0 or amount > balance or target_reverses_id is not null then
      raise exception 'The amount must not exceed the unpaid fine balance'; end if;
  end if;
  insert into public.member_fine_transactions(id,producer_id,fine_id,kind,amount_cents,reason,reverses_id,created_by,staff_label)
  values(target_transaction_id,f.producer_id,f.id,target_kind,amount,trim(target_reason),
    case when target_kind = 'reversal' then original.id end,auth.uid(),coalesce(auth.jwt()->>'email',auth.uid()::text));
  return target_transaction_id;
end;
$$;

create function public.manage_member_fine_exception(target_fine_id uuid, target_exception_id uuid,
  target_event_roping_id uuid, target_expires_at timestamptz, target_reason text, target_revoke boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare f public.member_fines%rowtype;
begin
  select * into f from public.member_fines where id = target_fine_id for update;
  if f.id is null or auth.uid() is null or not public.can_manage_organization(f.producer_id) then
    raise exception 'You do not have permission to approve an exception'; end if;
  if target_exception_id is null or length(trim(coalesce(target_reason,''))) not between 5 and 2000 or target_revoke is null then
    raise exception 'A clearly explained reason is required'; end if;
  if target_revoke then
    update public.member_fine_exceptions set revoked_at = now(), revoked_by = auth.uid(), revocation_reason = trim(target_reason)
    where id = target_exception_id and fine_id = f.id and revoked_at is null;
    if not found then raise exception 'This exception is already revoked or unavailable'; end if;
  else
    if target_expires_at is null or target_expires_at <= now() then raise exception 'Choose a future expiry date and time'; end if;
    if target_event_roping_id is not null and not exists(select 1 from public.event_ropings r
      where r.id = target_event_roping_id and r.producer_id = f.producer_id) then raise exception 'Choose a roping from this producer'; end if;
    if exists(select 1 from public.member_fine_exceptions where id = target_exception_id) then
      if exists(select 1 from public.member_fine_exceptions where id = target_exception_id and fine_id = f.id
        and event_roping_id is not distinct from target_event_roping_id and expires_at = target_expires_at
        and reason = trim(target_reason) and revoked_at is null) then return target_exception_id; end if;
      raise exception 'This exception reference has already been used'; end if;
    insert into public.member_fine_exceptions(id,producer_id,fine_id,event_roping_id,expires_at,reason,created_by,staff_label)
    values(target_exception_id,f.producer_id,f.id,target_event_roping_id,target_expires_at,trim(target_reason),auth.uid(),coalesce(auth.jwt()->>'email',auth.uid()::text));
  end if;
  return target_exception_id;
end;
$$;

create function public.member_fine_blocks(target_producer_id uuid, target_roper_id uuid, target_roping_id uuid, target_activity text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.member_fines f join public.memberships m on m.id = f.membership_id
    where f.producer_id = target_producer_id and m.roper_id = target_roper_id
      and f.restriction in (target_activity,'both') and public.member_fine_balance(f.id) > 0
      and (target_activity <> 'competition' or not target_roping_id = any(f.exempt_roping_ids))
      and not exists(select 1 from public.member_fine_exceptions x where x.fine_id = f.id
        and x.revoked_at is null and x.expires_at > now()
        and (x.event_roping_id is null or x.event_roping_id = target_roping_id)));
$$;
revoke all on function public.member_fine_blocks(uuid,uuid,uuid,text) from public, anon, authenticated;

create function public.enforce_member_fine_entry() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.competition_status <> 'active' then return new; end if;
  if tg_op = 'UPDATE' and new.event_roping_id = old.event_roping_id and new.roper_id = old.roper_id
    and new.competition_status = old.competition_status then return new; end if;
  if public.member_fine_blocks(new.producer_id,new.roper_id,new.event_roping_id,'entry') then
    raise exception 'An outstanding member fine blocks new entries. Contact the producer to arrange payment or an exception.';
  end if;
  return new;
end;
$$;
create trigger entries_enforce_member_fines before insert or update of event_roping_id,roper_id,competition_status
on public.roping_entries for each row execute function public.enforce_member_fine_entry();

create function public.enforce_member_fine_run() returns trigger
language plpgsql security definer set search_path = '' as $$
declare roper uuid;
begin
  if new.status <> 'complete' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'complete' then return new; end if;
  select roper_id into roper from public.roping_entries where id = new.entry_id;
  if public.member_fine_blocks(new.producer_id,roper,new.event_roping_id,'competition') then
    raise exception 'An outstanding member fine blocks competition in this roping. Record payment or approve a fine exception first.';
  end if;
  return new;
end;
$$;
create trigger runs_enforce_member_fines before insert or update of status on public.competition_runs
for each row execute function public.enforce_member_fine_run();

create function public.enforce_online_member_fines() returns trigger
language plpgsql security definer set search_path = '' as $$
declare request public.online_entry_submissions%rowtype; roper uuid;
begin
  select * into request from public.online_entry_submissions where id = new.submission_id;
  roper := request.roper_id;
  if roper is null then
    select m.roper_id into roper from public.memberships m join public.ropers r on r.id = m.roper_id
    where m.producer_id = request.producer_id and lower(r.email) = lower(request.email) limit 1;
  end if;
  if public.member_fine_blocks(request.producer_id,roper,new.event_roping_id,'entry') then
    raise exception 'A member account restriction prevents this entry. Contact the producer.'; end if;
  return new;
end;
$$;
create trigger online_entries_enforce_member_fines before insert on public.online_entry_submission_ropings
for each row execute function public.enforce_online_member_fines();

create function public.event_member_fine_restrictions(target_roping_id uuid)
returns table(entry_id uuid, blocked boolean) language sql stable security definer set search_path = '' as $$
  select e.id,public.member_fine_blocks(e.producer_id,e.roper_id,e.event_roping_id,'competition')
  from public.roping_entries e where e.event_roping_id = target_roping_id and public.has_organization_access(e.producer_id);
$$;
create function public.my_memberships()
returns table(id uuid, member_number text, producer_name text)
language sql stable security definer set search_path = '' as $$
  select m.id,m.member_number,p.name from public.memberships m join public.ropers r on r.id = m.roper_id
  join public.producers p on p.id = m.producer_id where r.auth_user_id = auth.uid() order by p.name;
$$;
revoke all on function public.issue_member_fine(uuid,integer,text,text,uuid,uuid) from public, anon;
revoke all on function public.record_member_fine_transaction(uuid,text,integer,text,uuid,uuid) from public, anon;
revoke all on function public.manage_member_fine_exception(uuid,uuid,uuid,timestamptz,text,boolean) from public, anon;
revoke all on function public.event_member_fine_restrictions(uuid) from public, anon;
revoke all on function public.my_memberships() from public, anon;
revoke all on function public.enforce_member_fine_entry(), public.enforce_member_fine_run(), public.enforce_online_member_fines() from public, anon, authenticated;
grant execute on function public.issue_member_fine(uuid,integer,text,text,uuid,uuid) to authenticated;
grant execute on function public.record_member_fine_transaction(uuid,text,integer,text,uuid,uuid) to authenticated;
grant execute on function public.manage_member_fine_exception(uuid,uuid,uuid,timestamptz,text,boolean) to authenticated;
grant execute on function public.event_member_fine_restrictions(uuid) to authenticated;
grant execute on function public.my_memberships() to authenticated;
