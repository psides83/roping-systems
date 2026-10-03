alter table public.organization_memberships
  add column profile_fields jsonb not null default '{}'::jsonb
    check (jsonb_typeof(profile_fields) = 'object');

create function public.update_organization_member_v2(
  target_organization_id uuid,
  target_membership_id uuid,
  member_first_name text,
  member_last_name text,
  member_email text,
  member_phone text,
  member_birth_date date,
  member_competition_gender public.competition_gender,
  new_member_number text,
  new_status public.membership_status,
  new_joined_on date,
  new_expires_on date,
  new_notes text,
  classification_changes jsonb,
  classification_effective_on date,
  classification_change_reason text,
  member_profile_fields jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if member_profile_fields is null
    or jsonb_typeof(member_profile_fields) <> 'object' then
    raise exception 'Additional member information is invalid';
  end if;

  perform public.update_organization_member(
    target_organization_id,
    target_membership_id,
    member_first_name,
    member_last_name,
    member_email,
    member_phone,
    member_birth_date,
    member_competition_gender,
    new_member_number,
    new_status,
    new_joined_on,
    new_expires_on,
    new_notes,
    classification_changes,
    classification_effective_on,
    classification_change_reason
  );

  update public.organization_memberships
  set profile_fields = profile_fields || member_profile_fields
  where id = target_membership_id
    and organization_id = target_organization_id;
end;
$$;

revoke all on function public.update_organization_member_v2(
  uuid, uuid, text, text, text, text, date, public.competition_gender, text,
  public.membership_status, date, date, text, jsonb, date, text, jsonb
) from public;
grant execute on function public.update_organization_member_v2(
  uuid, uuid, text, text, text, text, date, public.competition_gender, text,
  public.membership_status, date, date, text, jsonb, date, text, jsonb
) to authenticated;
