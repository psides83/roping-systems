begin;
-- Compare every field and label with the previous implementation for a staff
-- account, then exercise reads with the actual authenticated database role.
select set_config('request.jwt.claim.sub',
  (select id::text from auth.users where lower(email)='psides83@hotmail.com'),true);
create temporary table expected_audit_history as
select audit.id,audit.producer_id,audit.actor_user_id,
  coalesce(u.email,case when audit.actor_user_id is null
    then 'Public or automated action' else 'Unknown user' end::varchar) as actor_label,
  audit.entity_type,audit.entity_id,audit.action,audit.before_data,audit.after_data,audit.created_at
from public.producer_audit_log audit
left join auth.users u on u.id=audit.actor_user_id
where public.has_organization_access(audit.producer_id)
order by audit.id desc limit 20;
grant select on expected_audit_history to authenticated;
set local role authenticated;
do $$
begin
  if exists (
    (select * from expected_audit_history except all select * from public.producer_audit_history where id in (select id from expected_audit_history))
    union all
    (select * from public.producer_audit_history where id in (select id from expected_audit_history) except all select * from expected_audit_history)
  ) then raise exception 'Authorized audit history changed'; end if;
end;
$$;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$
begin
  if exists (select 1 from public.producer_audit_history where id in (select id from expected_audit_history)) then
    raise exception 'Unrelated user can read audit history';
  end if;
end;
$$;
select set_config('request.jwt.claim.sub','',true);
do $$
begin
  if exists (select 1 from public.producer_audit_history where id in (select id from expected_audit_history)) then
    raise exception 'Request without a user can read audit history';
  end if;
end;
$$;
reset role;
do $$
begin
  if has_table_privilege('anon','public.producer_audit_history','select')
    or has_function_privilege('anon','private.audit_actor_label(uuid,uuid)','execute')
    or has_schema_privilege('authenticated','private','usage') then
    raise exception 'Anonymous view access or direct private lookup access is enabled';
  end if;
  if exists (
    select 1 from pg_rewrite rewrite
    join pg_depend dependency on dependency.classid='pg_rewrite'::regclass and dependency.objid=rewrite.oid
    where rewrite.ev_class='public.producer_audit_history'::regclass
      and dependency.refclassid='pg_class'::regclass
      and dependency.refobjid='auth.users'::regclass
  ) then raise exception 'Audit view directly references auth.users'; end if;
end;
$$;
rollback;
