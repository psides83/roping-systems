create table public.producer_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete cascade,
  email text not null check(email=lower(trim(email))),
  role public.organization_role not null,
  invited_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_at timestamptz,
  cancelled_at timestamptz
);
create unique index staff_pending_invitation on public.producer_staff_invitations(producer_id,email)
where accepted_at is null and cancelled_at is null;
alter table public.producer_staff_invitations enable row level security;
revoke all on public.producer_staff_invitations from anon,authenticated;
grant select on public.producer_staff_invitations to authenticated;
create policy "Staff managers read invitations" on public.producer_staff_invitations for select
using(public.can_administer_organization(producer_id));
create trigger audit_staff_invitations after insert or update or delete on public.producer_staff_invitations
for each row execute function public.write_audit_log();
create trigger audit_staff_access after insert or update or delete on public.producer_staff
for each row execute function public.write_audit_log();
revoke insert,update,delete on public.producer_staff from authenticated;

create function public.invite_producer_staff(target_producer uuid,target_email text,target_role public.organization_role)
returns uuid language plpgsql security definer set search_path='' as $$
declare actor_role text; invitation_id uuid;
begin
  perform 1 from public.producers where id=target_producer for update;
  select role::text into actor_role from public.producer_staff where producer_id=target_producer and user_id=auth.uid();
  if not public.is_platform_owner() and (actor_role is null or actor_role not in ('owner','admin')) then raise exception 'Staff management requires an owner or administrator.'; end if;
  if target_role='owner' and not public.is_platform_owner() then raise exception 'Only the platform owner can invite a producer owner.'; end if;
  if actor_role='admin' and target_role in ('owner','admin') then raise exception 'Administrators may invite only lower-level staff.'; end if;
  if target_email is null or trim(target_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email.'; end if;
  if exists(select 1 from public.producer_staff s join auth.users u on u.id=s.user_id where s.producer_id=target_producer and lower(u.email)=lower(trim(target_email))) then raise exception 'This person already has staff access.'; end if;
  update public.producer_staff_invitations set cancelled_at=now() where producer_id=target_producer and email=lower(trim(target_email)) and accepted_at is null and cancelled_at is null and expires_at<=now();
  insert into public.producer_staff_invitations(producer_id,email,role,invited_by)
    values(target_producer,lower(trim(target_email)),target_role,auth.uid()) returning id into invitation_id;
  return invitation_id;
end;
$$;

create function public.my_staff_invitations()
returns table(id uuid,producer_name text,role text,expires_at timestamptz)
language sql stable security definer set search_path='' as $$
  select i.id,p.name,i.role::text,i.expires_at from public.producer_staff_invitations i
  join public.producers p on p.id=i.producer_id join auth.users u on u.id=auth.uid()
  where lower(u.email)=i.email and u.email_confirmed_at is not null
    and i.accepted_at is null and i.cancelled_at is null and i.expires_at>now();
$$;

create or replace function public.protect_producer_staff_roles() returns trigger
language plpgsql security definer set search_path='' as $$
declare actor_role text; tenant uuid;
begin
  if auth.uid() is null then return coalesce(new,old); end if;
  tenant := case when tg_op='DELETE' then old.producer_id else new.producer_id end;
  perform 1 from public.producers where id=tenant for update;
  if tg_op='INSERT' and new.user_id=auth.uid() and exists(
    select 1 from public.producer_staff_invitations i join auth.users u on u.id=auth.uid()
    where i.producer_id=tenant and i.role=new.role and i.email=lower(u.email) and u.email_confirmed_at is not null
      and i.accepted_at is null and i.cancelled_at is null and i.expires_at>now()
      and (exists(select 1 from public.platform_owners where user_id=i.invited_by)
        or exists(select 1 from public.producer_staff s where s.producer_id=tenant and s.user_id=i.invited_by
          and (s.role='owner' and i.role<>'owner' or s.role='admin' and i.role in ('operator','viewer'))))
  ) then return new; end if;
  select role::text into actor_role from public.producer_staff where producer_id=tenant and user_id=auth.uid();
  if tg_op='UPDATE' and (new.producer_id<>old.producer_id or new.user_id<>old.user_id) then raise exception 'Staff identity cannot be changed.'; end if;
  if actor_role='admin' then
    if (tg_op<>'INSERT' and old.role in ('owner','admin')) or (tg_op<>'DELETE' and new.role in ('owner','admin')) then raise exception 'Administrators may manage only lower-level staff.'; end if;
  elsif actor_role is distinct from 'owner' and not public.is_platform_owner() then raise exception 'Staff management requires an owner or administrator.'; end if;
  if tg_op<>'INSERT' and old.role='owner' and (tg_op='DELETE' or new.role<>'owner')
    and not exists(select 1 from public.producer_staff where producer_id=tenant and role='owner' and user_id<>old.user_id) then raise exception 'A producer must retain an owner.'; end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;

create function public.accept_staff_invitation(target_invitation uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare invitation public.producer_staff_invitations%rowtype;
begin
  -- Use the same producer-first lock order as staff management.
  perform 1 from public.producers where id=(select producer_id from public.producer_staff_invitations where id=target_invitation) for update;
  select i.* into invitation from public.producer_staff_invitations i join auth.users u on u.id=auth.uid()
    where i.id=target_invitation and i.email=lower(u.email) and u.email_confirmed_at is not null
      and i.accepted_at is null and i.cancelled_at is null and i.expires_at>now() for update of i;
  if not found then raise exception 'Invitation unavailable. Sign in with the invited verified email.'; end if;
  if exists(select 1 from public.producer_staff where producer_id=invitation.producer_id and user_id=auth.uid()) then raise exception 'You already have staff access.'; end if;
  insert into public.producer_staff(producer_id,user_id,role) values(invitation.producer_id,auth.uid(),invitation.role);
  update public.producer_staff_invitations set accepted_at=now() where id=invitation.id;
  return invitation.producer_id;
end;
$$;

create function public.cancel_staff_invitation(target_invitation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare invitation public.producer_staff_invitations%rowtype; actor_role text;
begin
  perform 1 from public.producers where id=(select producer_id from public.producer_staff_invitations where id=target_invitation) for update;
  select * into invitation from public.producer_staff_invitations where id=target_invitation for update;
  select role::text into actor_role from public.producer_staff where producer_id=invitation.producer_id and user_id=auth.uid();
  if not public.is_platform_owner() and (actor_role is null or actor_role not in ('owner','admin')) then raise exception 'Staff management requires an owner or administrator.'; end if;
  if actor_role='admin' and invitation.role in ('owner','admin') then raise exception 'Administrators may manage only lower-level staff.'; end if;
  update public.producer_staff_invitations set cancelled_at=now() where id=target_invitation and accepted_at is null;
end;
$$;

create function public.manage_producer_staff(target_producer uuid,target_user uuid,target_role public.organization_role)
returns void language plpgsql security definer set search_path='' as $$
declare actor_role text;
begin
  perform 1 from public.producers where id=target_producer for update;
  select role::text into actor_role from public.producer_staff where producer_id=target_producer and user_id=auth.uid();
  if not public.is_platform_owner() and (actor_role is null or actor_role not in ('owner','admin')) then raise exception 'Staff management requires an owner or administrator.'; end if;
  if target_role='owner' and not public.is_platform_owner() then raise exception 'Only the platform owner can assign producer owners.'; end if;
  if target_role is null then
    update public.producer_staff_invitations i set cancelled_at=now() from auth.users u
      where u.id=target_user and i.producer_id=target_producer and i.email=lower(u.email) and i.accepted_at is null;
    delete from public.producer_staff where producer_id=target_producer and user_id=target_user;
  else update public.producer_staff set role=target_role where producer_id=target_producer and user_id=target_user; end if;
  if not found then raise exception 'Staff member not found.'; end if;
end;
$$;

revoke all on function public.invite_producer_staff(uuid,text,public.organization_role),public.my_staff_invitations(),public.accept_staff_invitation(uuid),public.cancel_staff_invitation(uuid),public.manage_producer_staff(uuid,uuid,public.organization_role) from public,anon;
grant execute on function public.invite_producer_staff(uuid,text,public.organization_role),public.my_staff_invitations(),public.accept_staff_invitation(uuid),public.cancel_staff_invitation(uuid),public.manage_producer_staff(uuid,uuid,public.organization_role) to authenticated;
