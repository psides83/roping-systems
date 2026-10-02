create or replace function public.set_entry_options(
  target_entry_id uuid,
  selected_roping_fee_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_record public.entries%rowtype;
  roping_status public.roping_status;
  selected_ids uuid[] := coalesce(selected_roping_fee_ids, array[]::uuid[]);
  selected_fee_id uuid;
begin
  select * into entry_record
  from public.entries
  where id = target_entry_id;

  if entry_record.id is null
    or not public.can_manage_organization(entry_record.organization_id)
  then
    raise exception 'You do not have permission to update this entry';
  end if;

  select status into roping_status
  from public.ropings
  where id = entry_record.roping_id;

  if roping_status in ('completed', 'cancelled') then
    raise exception 'Entry options cannot be changed after the event is completed or cancelled';
  end if;

  if exists (
    select 1
    from unnest(selected_ids) selected(id)
    left join public.roping_fees fee on fee.id = selected.id
    where fee.id is null
      or fee.organization_id <> entry_record.organization_id
      or fee.roping_id <> entry_record.roping_id
      or fee.is_required
      or (
        fee.roping_division_id is not null
        and fee.roping_division_id <> entry_record.roping_division_id
      )
  ) then
    raise exception 'One or more selected entry options are unavailable';
  end if;

  delete from public.entry_charges charge
  using public.roping_fees fee
  where charge.roping_fee_id = fee.id
    and charge.organization_id = entry_record.organization_id
    and charge.roping_id = entry_record.roping_id
    and charge.person_id = entry_record.person_id
    and fee.is_required = false
    and (
      fee.roping_division_id is null
      or fee.roping_division_id = entry_record.roping_division_id
    )
    and (
      charge.entry_id = entry_record.id
      or (charge.entry_id is null and fee.scope <> 'entry')
    )
    and not (fee.id = any(selected_ids));

  foreach selected_fee_id in array selected_ids
  loop
    perform public.add_entry_option(entry_record.id, selected_fee_id);
  end loop;

  return cardinality(selected_ids);
end;
$$;

revoke all on function public.set_entry_options(uuid, uuid[]) from public;
grant execute on function public.set_entry_options(uuid, uuid[]) to authenticated;
