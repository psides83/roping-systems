create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_record jsonb;
  new_record jsonb;
  target_organization_id uuid;
  target_entity_id uuid;
begin
  old_record := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_record := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  target_organization_id := coalesce(
    (new_record ->> 'organization_id')::uuid,
    (old_record ->> 'organization_id')::uuid,
    case when tg_table_name = 'organizations' then coalesce((new_record ->> 'id')::uuid, (old_record ->> 'id')::uuid) end
  );
  target_entity_id := coalesce(
    (new_record ->> 'id')::uuid,
    (old_record ->> 'id')::uuid,
    (new_record ->> 'user_id')::uuid,
    (old_record ->> 'user_id')::uuid
  );

  insert into public.audit_log (organization_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (target_organization_id, auth.uid(), tg_table_name, target_entity_id, lower(tg_op), old_record, new_record);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger audit_organizations after insert or update or delete on public.organizations
for each row execute function public.write_audit_log();
create trigger audit_organization_users after insert or update or delete on public.organization_users
for each row execute function public.write_audit_log();
create trigger audit_roping_divisions after insert or update or delete on public.roping_divisions
for each row execute function public.write_audit_log();
create trigger audit_roping_fees after insert or update or delete on public.roping_fees
for each row execute function public.write_audit_log();
create trigger audit_entry_charges after insert or update or delete on public.entry_charges
for each row execute function public.write_audit_log();
create trigger audit_online_entry_request_items after insert or update or delete on public.online_entry_request_items
for each row execute function public.write_audit_log();
create trigger audit_online_entry_request_options after insert or update or delete on public.online_entry_request_options
for each row execute function public.write_audit_log();
create trigger audit_payout_schedule_brackets after insert or update or delete on public.payout_schedule_brackets
for each row execute function public.write_audit_log();
create trigger audit_payout_schedule_places after insert or update or delete on public.payout_schedule_places
for each row execute function public.write_audit_log();
create trigger audit_roping_payout_brackets after insert or update or delete on public.roping_payout_brackets
for each row execute function public.write_audit_log();
create trigger audit_roping_payout_places after insert or update or delete on public.roping_payout_places
for each row execute function public.write_audit_log();

create view public.organization_audit_history
with (security_invoker = false)
as
select
  audit.id,
  audit.organization_id,
  audit.actor_user_id,
  coalesce(auth_user.email, case when audit.actor_user_id is null then 'Public or automated action' else 'Unknown user' end) as actor_label,
  audit.entity_type,
  audit.entity_id,
  audit.action,
  audit.before_data,
  audit.after_data,
  audit.created_at
from public.audit_log audit
left join auth.users auth_user on auth_user.id = audit.actor_user_id
where public.has_organization_access(audit.organization_id);

revoke all on public.organization_audit_history from public;
grant select on public.organization_audit_history to authenticated;
