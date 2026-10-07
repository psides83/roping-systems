create table public.platform_owners (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_owners enable row level security;
revoke all on public.platform_owners from anon, authenticated;
do $$
declare owner_id uuid;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  insert into public.platform_owners(user_id) values(owner_id);
end;
$$;

create function public.is_platform_owner() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.platform_owners where user_id=auth.uid());
$$;
revoke all on function public.is_platform_owner() from public;
grant execute on function public.is_platform_owner() to authenticated;

alter function public.create_organization(text,text) rename to create_producer_internal;
revoke all on function public.create_producer_internal(text,text) from public,anon,authenticated;
create function public.create_organization(organization_name text, organization_slug text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_platform_owner() then raise exception 'Only the platform owner can create producers.'; end if;
  return public.create_producer_internal(organization_name,organization_slug);
end;
$$;
revoke all on function public.create_organization(text,text) from public,anon;
grant execute on function public.create_organization(text,text) to authenticated;

-- Prevent administrators from elevating themselves or changing owners/admins.
create function public.protect_producer_staff_roles() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor_role text; tenant uuid;
begin
  if auth.uid() is null then return coalesce(new,old); end if;
  tenant := case when tg_op='DELETE' then old.producer_id else new.producer_id end;
  perform 1 from public.producers where id=tenant for update;
  select role::text into actor_role from public.producer_staff where producer_id=tenant and user_id=auth.uid();
  if tg_op='UPDATE' and (new.producer_id<>old.producer_id or new.user_id<>old.user_id) then
    raise exception 'Staff identity cannot be changed.';
  end if;
  if actor_role='admin' then
    if (tg_op<>'INSERT' and old.role in ('owner','admin')) or (tg_op<>'DELETE' and new.role in ('owner','admin')) then
      raise exception 'Administrators may manage only lower-level staff.';
    end if;
  elsif actor_role is distinct from 'owner' and not public.is_platform_owner() then
    raise exception 'Staff management requires an owner or administrator.';
  end if;
  if tg_op<>'INSERT' and old.role='owner' and (tg_op='DELETE' or new.role<>'owner')
    and not exists(select 1 from public.producer_staff where producer_id=tenant and role='owner' and user_id<>old.user_id) then
    raise exception 'A producer must retain an owner.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
create trigger protect_producer_staff_roles before insert or update or delete on public.producer_staff
for each row execute function public.protect_producer_staff_roles();
