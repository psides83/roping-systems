create or replace function public.create_event_entry(
  target_roping_division_id uuid,
  target_person_id uuid,
  entry_origin public.entry_source default 'office',
  initial_payment_status public.payment_status default 'unpaid'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  selected_membership_id uuid;
  existing_entry_count integer;
  new_entry_id uuid;
  fee_record public.roping_fees%rowtype;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to add entries to this division';
  end if;

  select id into selected_membership_id
  from public.organization_memberships
  where organization_id = division_record.organization_id
    and person_id = target_person_id
    and status = 'active'
  limit 1;

  if selected_membership_id is null and not division_record.allow_guests then
    raise exception 'This division requires an active membership';
  end if;

  select count(*) into existing_entry_count
  from public.entries
  where roping_division_id = target_roping_division_id
    and person_id = target_person_id;

  if division_record.maximum_entries_per_person is not null
    and existing_entry_count >= division_record.maximum_entries_per_person then
    raise exception 'This contestant has reached the entry limit for this division';
  end if;

  insert into public.entries (
    organization_id,
    roping_id,
    roping_division_id,
    person_id,
    membership_id,
    entry_number,
    source,
    payment_status
  )
  values (
    division_record.organization_id,
    division_record.roping_id,
    division_record.id,
    target_person_id,
    selected_membership_id,
    existing_entry_count + 1,
    entry_origin,
    initial_payment_status
  )
  returning id into new_entry_id;

  for fee_record in
    select * from public.roping_fees
    where roping_id = division_record.roping_id
      and (roping_division_id = division_record.id or roping_division_id is null)
      and is_required = true
    order by sort_order, created_at
  loop
    if fee_record.scope = 'entry' then
      insert into public.entry_charges (
        organization_id, roping_id, person_id, entry_id, roping_fee_id, title, amount_cents
      ) values (
        division_record.organization_id, division_record.roping_id, target_person_id, new_entry_id, fee_record.id, fee_record.title, fee_record.amount_cents
      );
    elsif not exists (
      select 1 from public.entry_charges charge
      join public.roping_fees charged_fee on charged_fee.id = charge.roping_fee_id
      where charge.roping_id = division_record.roping_id
        and charge.person_id = target_person_id
        and (
          charge.roping_fee_id = fee_record.id
          or (
            fee_record.scope = 'contestant_event'
            and fee_record.source_template_id is not null
            and charged_fee.source_template_id = fee_record.source_template_id
          )
        )
    ) then
      insert into public.entry_charges (
        organization_id, roping_id, person_id, entry_id, roping_fee_id, title, amount_cents
      ) values (
        division_record.organization_id, division_record.roping_id, target_person_id, null, fee_record.id, fee_record.title, fee_record.amount_cents
      );
    end if;
  end loop;

  for run_index in 1..division_record.number_of_runs loop
    insert into public.runs (organization_id, roping_division_id, entry_id, run_number)
    values (division_record.organization_id, division_record.id, new_entry_id, run_index);
  end loop;

  return new_entry_id;
end;
$$;
