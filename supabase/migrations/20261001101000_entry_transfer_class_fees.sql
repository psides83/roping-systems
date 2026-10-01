create or replace function public.sync_transferred_entry_class_charges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge_record record;
  destination_fee public.roping_fees%rowtype;
  required_fee public.roping_fees%rowtype;
begin
  if new.roping_division_id = old.roping_division_id then
    return new;
  end if;

  if not exists (
    select 1
    from public.entries other_entry
    where other_entry.roping_division_id = old.roping_division_id
      and other_entry.person_id = old.person_id
      and other_entry.id <> old.id
  ) then
    for charge_record in
      select charge.*, fee.source_template_id, fee.kind
      from public.entry_charges charge
      join public.roping_fees fee on fee.id = charge.roping_fee_id
      where charge.entry_id is null
        and charge.roping_id = old.roping_id
        and charge.person_id = old.person_id
        and fee.roping_division_id = old.roping_division_id
        and fee.scope = 'contestant_division'
    loop
      select target_fee.* into destination_fee
      from public.roping_fees target_fee
      where target_fee.roping_division_id = new.roping_division_id
        and target_fee.scope = 'contestant_division'
        and (
          (
            charge_record.source_template_id is not null
            and target_fee.source_template_id = charge_record.source_template_id
          )
          or (
            target_fee.kind = charge_record.kind
            and lower(target_fee.title) = lower(charge_record.title)
            and target_fee.amount_cents = charge_record.amount_cents
          )
        )
      order by
        (target_fee.source_template_id = charge_record.source_template_id) desc nulls last,
        target_fee.sort_order,
        target_fee.created_at
      limit 1;

      if destination_fee.id is null then
        raise exception 'The destination class is missing a matching fee for "%"', charge_record.title;
      end if;

      if exists (
        select 1 from public.entry_charges
        where roping_id = new.roping_id
          and person_id = new.person_id
          and roping_fee_id = destination_fee.id
          and entry_id is null
      ) then
        delete from public.entry_charges where id = charge_record.id;
      else
        update public.entry_charges
        set roping_fee_id = destination_fee.id,
            title = destination_fee.title,
            amount_cents = destination_fee.amount_cents
        where id = charge_record.id;
      end if;
    end loop;
  end if;

  for required_fee in
    select *
    from public.roping_fees
    where roping_division_id = new.roping_division_id
      and scope = 'contestant_division'
      and is_required = true
    order by sort_order, created_at
  loop
    if not exists (
      select 1 from public.entry_charges
      where roping_id = new.roping_id
        and person_id = new.person_id
        and roping_fee_id = required_fee.id
        and entry_id is null
    ) then
      insert into public.entry_charges (
        organization_id,
        roping_id,
        person_id,
        entry_id,
        roping_fee_id,
        title,
        amount_cents
      ) values (
        new.organization_id,
        new.roping_id,
        new.person_id,
        null,
        required_fee.id,
        required_fee.title,
        required_fee.amount_cents
      );
    end if;
  end loop;

  return new;
end;
$$;

create trigger entries_sync_transferred_class_charges
before update of roping_division_id on public.entries
for each row
when (old.roping_division_id is distinct from new.roping_division_id)
execute function public.sync_transferred_entry_class_charges();
