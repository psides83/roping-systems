create or replace function public.set_contestant_event_payment_status(
  target_roping_id uuid,
  target_person_id uuid,
  new_payment_status public.payment_status
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  updated_count integer;
begin
  select organization_id into target_organization_id
  from public.ropings
  where id = target_roping_id;

  if target_organization_id is null
    or not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to update payments for this event';
  end if;

  if not exists (
    select 1 from public.entries
    where roping_id = target_roping_id
      and person_id = target_person_id
      and organization_id = target_organization_id
  ) then
    raise exception 'That contestant does not have entries in this event';
  end if;

  update public.entries
  set payment_status = new_payment_status
  where roping_id = target_roping_id
    and person_id = target_person_id
    and organization_id = target_organization_id;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.set_contestant_event_payment_status(
  uuid, uuid, public.payment_status
) from public;
grant execute on function public.set_contestant_event_payment_status(
  uuid, uuid, public.payment_status
) to authenticated;
