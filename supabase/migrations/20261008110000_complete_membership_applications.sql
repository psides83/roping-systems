create function public.approve_member_application_with_record(target_application uuid,decision text,
  selected_membership uuid,expires_on date,staff_note text,new_member jsonb default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.membership_applications%rowtype; member_id uuid:=selected_membership;
  person public.ropers%rowtype; classes uuid[]; extra jsonb; gender public.competition_gender;
begin
  select * into a from public.membership_applications where id=target_application for update;
  if a.id is null or not public.can_manage_organization(a.producer_id) then raise exception 'Member management access is required'; end if;
  if a.status<>'pending' then raise exception 'This application has already been reviewed'; end if;
  if decision='approved' and member_id is null then
    if a.application_kind='renewal' then raise exception 'A renewal must keep its existing member record'; end if;
    if new_member is null or jsonb_typeof(new_member)<>'object' then raise exception 'Complete the new member details'; end if;
    if length(trim(coalesce(staff_note,'')))<5 then raise exception 'Explain how the applicant identity was verified'; end if;
    if nullif(trim(new_member->>'firstName'),'') is null or nullif(trim(new_member->>'lastName'),'') is null
      or nullif(trim(new_member->>'memberNumber'),'') is null then raise exception 'Name and member number are required'; end if;
    gender:=(new_member->>'gender')::public.competition_gender;
    if gender is null then raise exception 'Competition gender is required'; end if;
    select coalesce(array_agg(value::uuid),'{}'::uuid[]) into classes from jsonb_array_elements_text(coalesce(new_member->'classifications','[]'));
    select * into person from public.ropers where lower(email)=lower(trim(new_member->>'email'));
    if person.id is not null and exists(select 1 from public.memberships where roper_id=person.id) then
      if person.competition_gender is distinct from gender or person.birth_date is distinct from nullif(new_member->>'birthDate','')::date then
        raise exception 'This roper already has a shared profile. Use their existing birth date and competition gender; request any correction separately';
      end if;
    end if;
    member_id:=public.create_organization_member_v2(a.producer_id,trim(new_member->>'firstName'),trim(new_member->>'lastName'),
      coalesce(new_member->>'email',''),coalesce(new_member->>'phone',''),nullif(new_member->>'birthDate','')::date,
      gender,classes,trim(new_member->>'memberNumber'),'pending');
    -- Account creation can have supplied a bare profile; fill it only before its first producer membership.
    update public.ropers r set first_name=trim(new_member->>'firstName'),last_name=trim(new_member->>'lastName'),phone=nullif(trim(new_member->>'phone'),'')
      where r.id=(select roper_id from public.memberships where id=member_id)
        and not exists(select 1 from public.memberships m where m.roper_id=r.id and m.id<>member_id);
    extra:=a.responses - array['first_name','last_name','email','phone','birth_date','competition_gender','member_number'];
    update public.memberships set profile_fields=profile_fields||extra where id=member_id;
  end if;
  perform public.review_member_application(target_application,decision,member_id,expires_on,staff_note);
  return member_id;
end; $$;
revoke all on function public.approve_member_application_with_record(uuid,text,uuid,date,text,jsonb) from public,anon;
grant execute on function public.approve_member_application_with_record(uuid,text,uuid,date,text,jsonb) to authenticated;

create table public.membership_application_receipts (
  application_id uuid primary key references public.membership_applications(id) on delete cascade,
  token_hash text not null, expires_at timestamptz not null default now()+interval '90 days',
  claimed_by uuid references auth.users(id),claimed_at timestamptz
);
alter table public.membership_application_receipts enable row level security;
revoke all on public.membership_application_receipts from anon,authenticated;

create function public.submit_membership_application_with_receipt(target_form_id uuid,application_responses jsonb,
  accepted_release boolean,entered_signature_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare application uuid; token text;
begin
  application:=public.submit_membership_application(target_form_id,application_responses,accepted_release,entered_signature_name);
  if auth.uid() is null then
    token:=encode(extensions.gen_random_bytes(32),'hex');
    insert into public.membership_application_receipts(application_id,token_hash)
      values(application,encode(extensions.digest(token,'sha256'),'hex'));
  end if;
  return jsonb_build_object('applicationId',application,'receiptCode',case when token is null then null else application::text||'.'||token end);
end; $$;
revoke all on function public.submit_membership_application_with_receipt(uuid,jsonb,boolean,text) from public;
grant execute on function public.submit_membership_application_with_receipt(uuid,jsonb,boolean,text) to anon,authenticated;

create function public.claim_membership_application(target_application uuid,receipt_token text) returns text
language plpgsql security definer set search_path='' as $$
declare a public.membership_applications%rowtype; receipt public.membership_application_receipts%rowtype;
  member public.memberships%rowtype; account_email text; owner_id uuid; pending_link uuid;
begin
  if auth.uid() is null then raise exception 'Sign in before linking your application'; end if;
  select lower(email) into account_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  if account_email is null then raise exception 'Confirm your sign-in email before linking your application'; end if;
  select * into a from public.membership_applications where id=target_application for update;
  select * into receipt from public.membership_application_receipts where application_id=target_application for update;
  if a.id is null or receipt.application_id is null or receipt.expires_at<=now()
    or receipt.token_hash<>encode(extensions.digest(coalesce(receipt_token,''),'sha256'),'hex') then
    raise exception 'This receipt is invalid or expired. Contact the producer';
  end if;
  if lower(trim(coalesce(a.applicant_email,'')))<>account_email then
    raise exception 'Sign in with the email provided on the application, or contact the producer for identity verification';
  end if;
  if receipt.claimed_by is not null and receipt.claimed_by<>auth.uid()
    or a.applicant_user_id is not null and a.applicant_user_id<>auth.uid() then raise exception 'This application is linked to another account'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||a.producer_id::text,0));
  if a.status='pending' and exists(select 1 from public.membership_applications where producer_id=a.producer_id
    and applicant_user_id=auth.uid() and status='pending' and id<>a.id) then raise exception 'You already have a pending application with this producer'; end if;
  if a.status='approved' then
    select * into member from public.memberships where id=a.membership_id and producer_id=a.producer_id for update;
    if member.id is null then raise exception 'Contact the producer to complete this membership'; end if;
    select auth_user_id into owner_id from public.ropers where id=member.roper_id for update;
    if owner_id is not null and owner_id<>auth.uid() or exists(select 1 from public.membership_link_requests
      where membership_id=member.id and status='approved' and user_id<>auth.uid()) then raise exception 'This member record is connected to another account'; end if;
    if not public.owns_membership(member.id) then
      select id into pending_link from public.membership_link_requests where user_id=auth.uid() and producer_id=a.producer_id and status='pending' for update;
      if pending_link is not null then
        update public.membership_link_requests set membership_id=member.id,status='approved',reason='Approved application; receipt and confirmed email verified',
          reviewed_by=a.reviewed_by,reviewed_at=now() where id=pending_link;
      else
        insert into public.membership_link_requests(producer_id,user_id,member_number,claimant_name,account_email,status,membership_id,reason,reviewed_by,reviewed_at)
          values(a.producer_id,auth.uid(),member.member_number,a.applicant_name,account_email,'approved',member.id,
            'Approved application; receipt and confirmed email verified',a.reviewed_by,now());
      end if;
    end if;
  end if;
  update public.membership_applications set applicant_user_id=auth.uid() where id=a.id;
  update public.membership_application_receipts set claimed_by=auth.uid(),claimed_at=coalesce(claimed_at,now()) where application_id=a.id;
  return a.status;
end; $$;
revoke all on function public.claim_membership_application(uuid,text) from public,anon;
grant execute on function public.claim_membership_application(uuid,text) to authenticated;

create function public.issue_membership_application_receipt(target_application uuid) returns text
language plpgsql security definer set search_path='' as $$
declare a public.membership_applications%rowtype; token text;
begin
  select * into a from public.membership_applications where id=target_application for update;
  if a.id is null or not public.can_manage_organization(a.producer_id) then raise exception 'Member management access is required'; end if;
  if a.applicant_user_id is not null then raise exception 'This application is already linked to an account'; end if;
  if nullif(trim(a.applicant_email),'') is null then raise exception 'This application has no email. Use the staff-reviewed account connection process'; end if;
  token:=encode(extensions.gen_random_bytes(32),'hex');
  insert into public.membership_application_receipts(application_id,token_hash) values(a.id,encode(extensions.digest(token,'sha256'),'hex'))
    on conflict(application_id) do update set token_hash=excluded.token_hash,expires_at=now()+interval '90 days',claimed_by=null,claimed_at=null;
  insert into public.producer_audit_log(producer_id,actor_user_id,entity_type,entity_id,action,before_data,after_data)
    values(a.producer_id,auth.uid(),'membership_applications',a.id,'update',null,jsonb_build_object('receiptReissued',true));
  return a.id::text||'.'||token;
end; $$;
revoke all on function public.issue_membership_application_receipt(uuid) from public,anon;
grant execute on function public.issue_membership_application_receipt(uuid) to authenticated;
