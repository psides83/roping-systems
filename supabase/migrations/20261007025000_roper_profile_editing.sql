-- Self-service updates use narrow RPCs, not unrestricted writes to eligibility fields.
drop policy "Users can update their profile" on public.ropers;

create table public.member_profile_corrections (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  membership_id uuid not null references public.memberships(id),
  user_id uuid not null references auth.users(id),
  original_birth_date date,
  original_gender public.competition_gender,
  requested_birth_date date,
  requested_gender public.competition_gender,
  reason text not null check(length(trim(reason)) between 5 and 1000),
  status text not null default 'pending' check(status in ('pending','approved','declined')),
  review_reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index member_profile_one_pending on public.member_profile_corrections(membership_id) where status='pending';
alter table public.member_profile_corrections enable row level security;
create policy "Read own or managed corrections" on public.member_profile_corrections for select to authenticated
  using((user_id=auth.uid() and public.owns_membership(membership_id)) or public.can_manage_organization(producer_id));
create trigger audit_profile_corrections after insert or update on public.member_profile_corrections
  for each row execute function public.write_audit_log();

create function public.my_member_profile(target_membership uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.owns_membership(target_membership) then raise exception 'This membership is not linked to your account'; end if;
  select jsonb_build_object('membershipId',m.id,'name',concat_ws(' ',r.first_name,r.last_name),
    'email',coalesce(r.email,''),'phone',coalesce(r.phone,''),'city',coalesce(m.profile_fields->>'city',''),
    'state',coalesce(m.profile_fields->>'state',''),'birthDate',r.birth_date,'gender',r.competition_gender,
    'profileRevision',r.updated_at,'membershipRevision',m.updated_at,
    'corrections',coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'status',q.status,
      'birthDate',q.requested_birth_date,'gender',q.requested_gender,'reason',q.reason,'reviewReason',q.review_reason)
      order by q.created_at desc) from public.member_profile_corrections q where q.membership_id=m.id and q.user_id=auth.uid()),'[]'::jsonb))
    into result from public.memberships m join public.ropers r on r.id=m.roper_id where m.id=target_membership;
  return result;
end;
$$;

create function public.update_my_member_contact(target_membership uuid, contact_email text, contact_phone text,
  contact_city text, contact_state text, profile_revision timestamptz, membership_revision timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare m public.memberships%rowtype; r public.ropers%rowtype; before_profile jsonb;
begin
  if not public.owns_membership(target_membership) then raise exception 'This membership is not linked to your account'; end if;
  select * into m from public.memberships where id=target_membership for update;
  select * into r from public.ropers where id=m.roper_id for update;
  if r.updated_at is distinct from profile_revision or m.updated_at is distinct from membership_revision then
    raise exception 'Your profile has changed. Reload before saving'; end if;
  if length(coalesce(contact_email,''))>254 or (nullif(trim(contact_email),'') is not null and trim(contact_email) !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Enter a valid contact email'; end if;
  if nullif(trim(contact_phone),'') is not null and trim(contact_phone) !~ '^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$' then raise exception 'Enter a 10-digit phone number'; end if;
  if contact_city is null or contact_state is null or length(contact_city)>100 or length(contact_state)>100 then raise exception 'Enter a valid city and state'; end if;
  if exists(select 1 from public.ropers where id<>r.id and lower(email)=lower(nullif(trim(contact_email),''))) then
    raise exception 'That contact email is already used by another roper. Contact your producer to resolve duplicate profiles'; end if;
  before_profile:=jsonb_build_object('email',r.email,'phone',r.phone);
  update public.ropers set email=nullif(lower(trim(contact_email)),''),phone=nullif(trim(contact_phone),'') where id=r.id;
  update public.memberships set profile_fields=profile_fields||jsonb_build_object('city',trim(contact_city),'state',trim(contact_state))
    where roper_id=r.id;
  insert into public.producer_audit_log(producer_id,actor_user_id,entity_type,entity_id,action,before_data,after_data)
    select producer_id,auth.uid(),'ropers',r.id,'update',before_profile,
      jsonb_build_object('email',nullif(lower(trim(contact_email)),''),'phone',nullif(trim(contact_phone),''),'source','roper_portal')
    from public.memberships where roper_id=r.id;
end;
$$;

create function public.request_member_profile_correction(target_membership uuid, new_birth_date date,
  new_gender public.competition_gender, request_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare m public.memberships%rowtype; r public.ropers%rowtype;
begin
  if not public.owns_membership(target_membership) then raise exception 'This membership is not linked to your account'; end if;
  select * into m from public.memberships where id=target_membership;
  select * into r from public.ropers where id=m.roper_id;
  if new_birth_date>current_date or new_birth_date<date '1900-01-01' then raise exception 'Enter a valid birth date'; end if;
  if coalesce(new_birth_date,r.birth_date) is not distinct from r.birth_date and coalesce(new_gender,r.competition_gender) is not distinct from r.competition_gender then
    raise exception 'Choose a birth date or competition gender to correct'; end if;
  insert into public.member_profile_corrections(producer_id,membership_id,user_id,original_birth_date,original_gender,requested_birth_date,requested_gender,reason)
    values(m.producer_id,m.id,auth.uid(),r.birth_date,r.competition_gender,new_birth_date,new_gender,trim(request_reason));
end;
$$;

create function public.review_member_profile_correction(request_id uuid, decision text, decision_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare q public.member_profile_corrections%rowtype; r public.ropers%rowtype; before_profile jsonb;
begin
  select * into q from public.member_profile_corrections where id=request_id for update;
  if q.id is null or not public.can_manage_organization(q.producer_id) then raise exception 'Member management access is required'; end if;
  if q.status<>'pending' then raise exception 'This request has already been reviewed'; end if;
  if decision is null or decision not in ('approved','declined') or length(trim(coalesce(decision_reason,''))) not between 5 and 1000 then
    raise exception 'Choose a decision and explain your verification'; end if;
  if decision='approved' then
    if not exists(select 1 from public.memberships m join public.ropers person on person.id=m.roper_id
      where m.id=q.membership_id and m.producer_id=q.producer_id and
      (person.auth_user_id=q.user_id or exists(select 1 from public.membership_link_requests l
        where l.membership_id=m.id and l.user_id=q.user_id and l.status='approved'))) then raise exception 'The account connection is no longer active'; end if;
    select person.* into r from public.ropers person join public.memberships m on m.roper_id=person.id where m.id=q.membership_id for update of person;
    if r.birth_date is distinct from q.original_birth_date or r.competition_gender is distinct from q.original_gender then
      raise exception 'Eligibility details have changed since this request. Decline it and ask for a new request'; end if;
    before_profile:=jsonb_build_object('birthDate',r.birth_date,'gender',r.competition_gender);
    update public.ropers set birth_date=coalesce(q.requested_birth_date,r.birth_date),competition_gender=coalesce(q.requested_gender,r.competition_gender) where id=r.id;
    insert into public.producer_audit_log(producer_id,actor_user_id,entity_type,entity_id,action,before_data,after_data)
      select producer_id,auth.uid(),'ropers',r.id,'update',before_profile,
        jsonb_build_object('birthDate',coalesce(q.requested_birth_date,r.birth_date),'gender',coalesce(q.requested_gender,r.competition_gender),'correctionRequest',q.id)
      from public.memberships where roper_id=r.id;
  end if;
  update public.member_profile_corrections set status=decision,review_reason=trim(decision_reason),reviewed_by=auth.uid(),reviewed_at=now() where id=q.id;
end;
$$;
revoke all on function public.my_member_profile(uuid),public.update_my_member_contact(uuid,text,text,text,text,timestamptz,timestamptz),
  public.request_member_profile_correction(uuid,date,public.competition_gender,text),public.review_member_profile_correction(uuid,text,text) from public,anon;
grant execute on function public.my_member_profile(uuid),public.update_my_member_contact(uuid,text,text,text,text,timestamptz,timestamptz),
  public.request_member_profile_correction(uuid,date,public.competition_gender,text),public.review_member_profile_correction(uuid,text,text) to authenticated;
