-- Identity remains available for the enrollment screen; privileges require AAL2.
create function public.is_platform_owner_identity() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.platform_owners where user_id=auth.uid());
$$;
revoke all on function public.is_platform_owner_identity() from public,anon;
grant execute on function public.is_platform_owner_identity() to authenticated;

create or replace function public.is_platform_owner() returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_platform_owner_identity() and coalesce(auth.jwt()->>'aal'='aal2',false);
$$;

create table public.platform_security_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  session_id text not null,
  verified_at timestamptz not null default now(),
  unique(user_id,session_id)
);
alter table public.platform_security_history enable row level security;
revoke all on public.platform_security_history from public,anon,authenticated;
grant select on public.platform_security_history to authenticated;
create policy verified_owner_read on public.platform_security_history for select to authenticated
using(public.is_platform_owner());

create function public.record_platform_verified_session() returns void
language plpgsql security definer set search_path='' as $$
declare session_key text := auth.jwt()->>'session_id';
begin
  if not public.is_platform_owner() then raise exception 'Platform owner two-factor verification is required'; end if;
  if session_key is null or length(session_key)>200 then raise exception 'A verified session is required'; end if;
  insert into public.platform_security_history(user_id,session_id) values(auth.uid(),session_key)
  on conflict(user_id,session_id) do nothing;
end $$;
revoke all on function public.record_platform_verified_session() from public,anon;
grant execute on function public.record_platform_verified_session() to authenticated;
