-- Resolve only the actor label privately; keep audit filtering and pagination
-- on the existing API view so reading one page does not load all audit rows.
create schema if not exists private;

create function private.audit_actor_label(target_actor_id uuid, target_producer_id uuid)
returns character varying
language plpgsql
stable
security definer
set search_path = ''
as $$
declare actor_email character varying;
begin
  if not public.has_organization_access(target_producer_id) then
    return null;
  end if;
  -- A label may only be resolved for an actor in this producer's audit log.
  if target_actor_id is not null and not exists (
    select 1 from public.producer_audit_log audit
    where audit.producer_id=target_producer_id and audit.actor_user_id=target_actor_id
  ) then return null; end if;
  select u.email into actor_email from auth.users u where u.id=target_actor_id;
  return coalesce(actor_email,case when target_actor_id is null
    then 'Public or automated action' else 'Unknown user' end::varchar);
end;
$$;

revoke all on function private.audit_actor_label(uuid,uuid) from public,anon,authenticated;
grant execute on function private.audit_actor_label(uuid,uuid) to authenticated;
revoke usage on schema private from public,anon,authenticated;

create or replace view public.producer_audit_history
with (security_invoker=false) as
select audit.id,audit.producer_id,audit.actor_user_id,
  private.audit_actor_label(audit.actor_user_id,audit.producer_id) as actor_label,
  audit.entity_type,audit.entity_id,audit.action,audit.before_data,audit.after_data,audit.created_at
from public.producer_audit_log audit
where public.has_organization_access(audit.producer_id);

revoke all on public.producer_audit_history from public,anon;
grant select on public.producer_audit_history to authenticated;
