-- Only staff of the producer can read its directory. Names never determine access.
create or replace view public.producer_staff_directory
with (security_invoker=false) as
select staff.producer_id,staff.user_id,staff.role,u.email,staff.created_at,
  left(coalesce(
    nullif(trim(concat_ws(' ',nullif(trim(r.first_name),''),nullif(trim(r.last_name),''))),''),
    nullif(trim(concat_ws(' ',nullif(trim(u.raw_user_meta_data->>'first_name'),''),nullif(trim(u.raw_user_meta_data->>'last_name'),''))),''),
    nullif(trim(u.raw_user_meta_data->>'full_name'),''),
    nullif(trim(u.raw_user_meta_data->>'name'),'')
  ),160) as display_name
from public.producer_staff staff
join auth.users u on u.id=staff.user_id
left join public.ropers r on r.auth_user_id=staff.user_id
where public.has_organization_access(staff.producer_id);
revoke all on public.producer_staff_directory from public,anon;
grant select on public.producer_staff_directory to authenticated;
