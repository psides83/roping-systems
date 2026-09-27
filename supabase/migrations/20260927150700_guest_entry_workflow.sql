create or replace function public.create_guest_event_entry(
  target_roping_division_id uuid,
  guest_first_name text,
  guest_last_name text,
  guest_email text,
  guest_phone text,
  initial_payment_status public.payment_status default 'unpaid'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  selected_person_id uuid;
begin
  select organization_id into target_organization_id
  from public.roping_divisions
  where id = target_roping_division_id;

  if target_organization_id is null or not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to add entries to this division';
  end if;

  if nullif(trim(guest_email), '') is not null then
    select id into selected_person_id
    from public.people
    where lower(email) = lower(trim(guest_email))
    limit 1;
  end if;

  if selected_person_id is null then
    insert into public.people (first_name, last_name, email, phone)
    values (
      trim(guest_first_name),
      trim(guest_last_name),
      nullif(lower(trim(guest_email)), ''),
      nullif(trim(guest_phone), '')
    )
    returning id into selected_person_id;
  end if;

  return public.create_event_entry(
    target_roping_division_id,
    selected_person_id,
    'office'::public.entry_source,
    initial_payment_status
  );
end;
$$;

grant execute on function public.create_guest_event_entry(uuid, text, text, text, text, public.payment_status) to authenticated;
