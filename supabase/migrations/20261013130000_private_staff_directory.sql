-- Keep auth.users out of API-exposed views. The private lookup deliberately
-- returns only directory fields and checks the requesting user's membership.
create schema if not exists private;

create function private.producer_staff_directory_rows()
returns table (
  producer_id uuid,
  user_id uuid,
  role public.organization_role,
  email character varying,
  created_at timestamptz,
  display_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select staff.producer_id,staff.user_id,staff.role,u.email,staff.created_at,
    left(coalesce(
      nullif(trim(concat_ws(' ',nullif(trim(r.first_name),''),nullif(trim(r.last_name),''))),''),
      nullif(trim(concat_ws(' ',nullif(trim(u.raw_user_meta_data->>'first_name'),''),nullif(trim(u.raw_user_meta_data->>'last_name'),''))),''),
      nullif(trim(u.raw_user_meta_data->>'full_name'),''),
      nullif(trim(u.raw_user_meta_data->>'name'),'')
    ),160)
  from public.producer_staff staff
  join auth.users u on u.id=staff.user_id
  left join public.ropers r on r.auth_user_id=staff.user_id
  where public.has_organization_access(staff.producer_id);
end;
$$;

-- The private schema is not exposed by PostgREST. Authenticated users need
-- EXECUTE for calls through the view, but cannot resolve private schema names.
revoke all on function private.producer_staff_directory_rows() from public,anon,authenticated;
grant execute on function private.producer_staff_directory_rows() to authenticated;
revoke usage on schema private from public,anon,authenticated;

create or replace view public.producer_staff_directory
with (security_invoker=false) as
select producer_id,user_id,role,email::varchar(255) as email,created_at,display_name
from private.producer_staff_directory_rows();

revoke all on public.producer_staff_directory from public,anon;
grant select on public.producer_staff_directory to authenticated;
