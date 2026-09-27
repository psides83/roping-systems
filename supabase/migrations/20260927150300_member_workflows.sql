create or replace function public.handle_new_auth_user()
returns trigger
security definer set search_path = ''
language plpgsql
as $$
declare
  existing_person_id uuid;
begin
  select id into existing_person_id
  from public.people
  where new.email is not null and lower(email) = lower(new.email)
  limit 1;

  if existing_person_id is not null then
    update public.people
    set
      auth_user_id = new.id,
      first_name = case when first_name = '' then coalesce(new.raw_user_meta_data ->> 'first_name', '') else first_name end,
      last_name = case when last_name = '' then coalesce(new.raw_user_meta_data ->> 'last_name', '') else last_name end,
      phone = coalesce(phone, new.phone)
    where id = existing_person_id and auth_user_id is null;
  else
    insert into public.people (auth_user_id, first_name, last_name, email, phone)
    values (
      new.id,
      coalesce(new.raw_user_meta_data ->> 'first_name', ''),
      coalesce(new.raw_user_meta_data ->> 'last_name', ''),
      new.email,
      new.phone
    );
  end if;

  return new;
end;
$$;

create or replace function public.create_organization_member(
  target_organization_id uuid,
  member_first_name text,
  member_last_name text,
  member_email text,
  member_phone text,
  new_member_number text,
  new_status public.membership_status default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_person_id uuid;
  new_membership_id uuid;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to add members to this organization';
  end if;

  if nullif(trim(member_email), '') is not null then
    select id into selected_person_id
    from public.people
    where lower(email) = lower(trim(member_email))
    limit 1;
  end if;

  if selected_person_id is null then
    insert into public.people (first_name, last_name, email, phone)
    values (
      trim(member_first_name),
      trim(member_last_name),
      nullif(lower(trim(member_email)), ''),
      nullif(trim(member_phone), '')
    )
    returning id into selected_person_id;
  end if;

  insert into public.organization_memberships (
    organization_id,
    person_id,
    member_number,
    status,
    joined_on
  )
  values (
    target_organization_id,
    selected_person_id,
    trim(new_member_number),
    new_status,
    current_date
  )
  returning id into new_membership_id;

  return new_membership_id;
end;
$$;

grant execute on function public.create_organization_member(uuid, text, text, text, text, text, public.membership_status) to authenticated;
