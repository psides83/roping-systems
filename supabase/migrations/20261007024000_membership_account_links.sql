-- Linking is producer-scoped; shared identity records and competition history stay intact.
create table public.membership_link_requests (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  member_number text not null check(length(trim(member_number)) between 1 and 80),
  claimant_name text not null check(length(trim(claimant_name)) between 2 and 160),
  account_email text not null,
  status text not null default 'pending' check(status in ('pending','approved','declined','revoked')),
  membership_id uuid references public.memberships(id),
  reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  check(status <> 'approved' or membership_id is not null)
);
create unique index membership_link_one_pending on public.membership_link_requests(user_id,producer_id) where status='pending';
create unique index membership_link_one_owner on public.membership_link_requests(membership_id) where status='approved';
alter table public.membership_link_requests enable row level security;
create policy "Read own or managed account requests" on public.membership_link_requests for select to authenticated
  using(user_id=auth.uid() or public.can_manage_organization(producer_id));
create trigger audit_membership_link_requests after insert or update on public.membership_link_requests
  for each row execute function public.write_audit_log();

create function public.owns_membership(target_membership_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.memberships m
    join public.ropers r on r.id=m.roper_id where m.id=target_membership_id and
    (r.auth_user_id=auth.uid() or exists(select 1 from public.membership_link_requests q
      where q.membership_id=m.id and q.producer_id=m.producer_id and q.user_id=auth.uid() and q.status='approved')));
$$;
revoke all on function public.owns_membership(uuid) from public,anon;
grant execute on function public.owns_membership(uuid) to authenticated;

create function public.request_membership_link(producer_slug text, requested_number text, requested_name text)
returns uuid language plpgsql security definer set search_path='' as $$
declare producer uuid; result uuid;
begin
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'Confirm your sign-in email before requesting a connection'; end if;
  select id into producer from public.producers where slug=trim(producer_slug);
  if producer is null then raise exception 'Check the producer URL slug'; end if;
  if exists(select 1 from public.membership_link_requests where user_id=auth.uid() and producer_id=producer and status='pending') then
    raise exception 'You already have a pending request for this producer'; end if;
  if (select count(*) from public.membership_link_requests where user_id=auth.uid() and created_at>now()-interval '1 day') >= 5 then
    raise exception 'Please wait before submitting more connection requests'; end if;
  insert into public.membership_link_requests(producer_id,user_id,member_number,claimant_name,account_email)
    values(producer,auth.uid(),trim(requested_number),trim(requested_name),(select email from auth.users where id=auth.uid())) returning id into result;
  return result;
end;
$$;

create function public.review_membership_link(request_id uuid, decision text, selected_membership uuid, verification_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare q public.membership_link_requests%rowtype; owner_id uuid;
begin
  select * into q from public.membership_link_requests where id=request_id for update;
  if q.id is null or not public.can_manage_organization(q.producer_id) then raise exception 'Member management access is required'; end if;
  if decision not in ('approved','declined','revoked') or decision is null then raise exception 'Choose a valid decision'; end if;
  if length(trim(coalesce(verification_reason,''))) not between 5 and 1000 then raise exception 'Explain how identity was verified or why access was declined or revoked'; end if;
  if (decision='revoked' and q.status<>'approved') or (decision<>'revoked' and q.status<>'pending') then raise exception 'This request has already changed. Reload the page'; end if;
  if decision='approved' then
    perform 1 from public.memberships where id=selected_membership and producer_id=q.producer_id for update;
    if not found then raise exception 'Choose a member belonging to this producer'; end if;
    select r.auth_user_id into owner_id from public.ropers r join public.memberships m on m.roper_id=r.id where m.id=selected_membership;
    if owner_id is not null and owner_id<>q.user_id then raise exception 'This member is already connected to another login'; end if;
    if owner_id=q.user_id then raise exception 'This membership is already linked'; end if;
    if not exists(select 1 from auth.users where id=q.user_id and email_confirmed_at is not null) then raise exception 'The requesting account must have a confirmed email'; end if;
  end if;
  update public.membership_link_requests set status=decision,
    membership_id=case when decision='approved' then selected_membership else membership_id end,
    reason=trim(verification_reason),reviewed_by=auth.uid(),reviewed_at=now() where id=q.id;
end;
$$;
revoke all on function public.request_membership_link(text,text,text),public.review_membership_link(uuid,text,uuid,text) from public,anon;
grant execute on function public.request_membership_link(text,text,text),public.review_membership_link(uuid,text,uuid,text) to authenticated;

-- Keep existing portal calculations; replace only their ownership guards.
do $$
declare fn regprocedure; definition text; updated text;
begin
  foreach fn in array array['public.my_roper_portal()'::regprocedure,'public.my_roper_accounts(uuid)'::regprocedure,
    'public.my_roper_bonus_positions(uuid,uuid)'::regprocedure,'public.my_roper_standings_context(uuid,uuid)'::regprocedure,
    'public.my_memberships()'::regprocedure,'public.can_read_member_fines(uuid)'::regprocedure] loop
    definition:=pg_get_functiondef(fn);
    updated:=regexp_replace(definition,'(person|r)\.auth_user_id\s*=\s*auth.uid\(\)','public.owns_membership(m.id)','g');
    if updated=definition then raise exception 'Missing ownership guard in %',fn; end if;
    execute updated;
  end loop;
end;
$$;

-- A signup creates its own profile, never claims existing memberships by email.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.ropers(auth_user_id,first_name,last_name,email,phone)
  values(new.id,coalesce(new.raw_user_meta_data->>'first_name',''),coalesce(new.raw_user_meta_data->>'last_name',''),
    case when exists(select 1 from public.ropers where lower(email)=lower(new.email)) then null else new.email end,new.phone);
  return new;
end;
$$;
