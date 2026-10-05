create or replace function public.write_audit_log()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  old_record jsonb;
  new_record jsonb;
  target_producer_id uuid;
  target_entity_id uuid;
begin
  old_record := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_record := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  target_producer_id := coalesce(
    (new_record ->> 'producer_id')::uuid,
    (old_record ->> 'producer_id')::uuid,
    case when tg_table_name = 'producers' then
      coalesce((new_record ->> 'id')::uuid, (old_record ->> 'id')::uuid) end
  );
  target_entity_id := coalesce(
    (new_record ->> 'id')::uuid, (old_record ->> 'id')::uuid,
    (new_record ->> 'user_id')::uuid, (old_record ->> 'user_id')::uuid
  );
  insert into public.producer_audit_log
    (producer_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  values (target_producer_id, auth.uid(), tg_table_name, target_entity_id,
    lower(tg_op), old_record, new_record);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
