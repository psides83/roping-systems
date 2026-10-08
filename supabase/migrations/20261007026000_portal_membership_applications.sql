alter table public.membership_applications
  add column applicant_user_id uuid references auth.users(id) on delete set null,
  add column membership_id uuid references public.memberships(id),
  add column application_kind text not null default 'application' check(application_kind in ('application','renewal'));
create unique index membership_application_one_pending on public.membership_applications(applicant_user_id,producer_id)
  where applicant_user_id is not null and status='pending';
drop policy "Producer managers can update membership applications" on public.membership_applications;

-- Preserve the current form snapshot/release implementation behind authenticated ownership checks.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.submit_membership_application(uuid,jsonb,boolean,text)'::regprocedure);
  execute replace(definition,'FUNCTION public.submit_membership_application(', 'FUNCTION public.submit_membership_application_internal(');
end;
$$;
revoke all on function public.submit_membership_application_internal(uuid,jsonb,boolean,text) from public,anon,authenticated;

create or replace function public.submit_membership_application(target_form_id uuid, application_responses jsonb,
  accepted_release boolean, entered_signature_name text) returns uuid
language plpgsql security definer set search_path='' as $$
declare producer uuid; result uuid; member uuid;
begin
  select producer_id into producer from public.membership_forms where id=target_form_id and publication_state='published';
  if producer is null then raise exception 'This membership form is not available'; end if;
  if auth.uid() is not null then
    if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception 'Confirm your sign-in email before applying'; end if;
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||producer::text,0));
    if exists(select 1 from public.membership_applications where applicant_user_id=auth.uid() and producer_id=producer and status='pending') then
      raise exception 'You already have an application awaiting producer review'; end if;
    select id into member from public.memberships where producer_id=producer and public.owns_membership(id) limit 1;
  end if;
  result:=public.submit_membership_application_internal(target_form_id,application_responses,accepted_release,entered_signature_name);
  update public.membership_applications set applicant_user_id=auth.uid(),membership_id=member,
    application_kind=case when member is null then 'application' else 'renewal' end where id=result;
  return result;
end;
$$;

create function public.membership_application_prefill(target_membership uuid, target_form uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.owns_membership(target_membership) or not exists(select 1 from public.memberships m
    join public.membership_forms f on f.producer_id=m.producer_id where m.id=target_membership and f.id=target_form and f.publication_state='published') then
    raise exception 'This membership is not linked to this form'; end if;
  return (select m.profile_fields||jsonb_build_object('first_name',r.first_name,'last_name',r.last_name,
    'email',coalesce(r.email,''),'phone',coalesce(r.phone,''),'birth_date',coalesce(r.birth_date::text,''),
    'competition_gender',coalesce(r.competition_gender::text,'')) from public.memberships m join public.ropers r on r.id=m.roper_id where m.id=target_membership);
end;
$$;

create function public.my_membership_applications() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('applications',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,
    'producerName',p.name,'producerSlug',p.slug,'kind',a.application_kind,'status',a.status,
    'submittedAt',a.submitted_at,'reviewedAt',a.reviewed_at) order by a.submitted_at desc)
    from public.membership_applications a join public.producers p on p.id=a.producer_id where a.applicant_user_id=auth.uid()),'[]'::jsonb),
    'forms',coalesce((select jsonb_agg(jsonb_build_object('producerName',p.name,'producerSlug',p.slug) order by p.name)
    from public.membership_forms f join public.producers p on p.id=f.producer_id where f.publication_state='published' and auth.uid() is not null),'[]'::jsonb));
$$;

create function public.review_member_application(target_application uuid, decision text, selected_membership uuid,
  expires_on date, staff_note text) returns void language plpgsql security definer set search_path='' as $$
declare a public.membership_applications%rowtype; m public.memberships%rowtype; owner_id uuid; pending_link uuid;
begin
  select * into a from public.membership_applications where id=target_application for update;
  if a.id is null or not public.can_manage_organization(a.producer_id) then raise exception 'Member management access is required'; end if;
  if a.status<>'pending' then raise exception 'This application has already been reviewed'; end if;
  if decision is null or decision not in ('approved','declined') then raise exception 'Choose an approval decision'; end if;
  if length(coalesce(staff_note,''))>1000 then raise exception 'The review note is too long'; end if;
  if decision='approved' then
    select * into m from public.memberships where id=selected_membership and producer_id=a.producer_id for update;
    if m.id is null then raise exception 'Select an existing member record; create one in Members first if needed'; end if;
    if a.application_kind='renewal' and m.id is distinct from a.membership_id then raise exception 'A renewal must keep its existing member record'; end if;
    if a.application_kind='renewal' and (expires_on is null or expires_on<=coalesce(m.expires_on,current_date)) then raise exception 'Choose an expiration date that extends the membership'; end if;
    if expires_on is not null and expires_on<current_date then raise exception 'The new expiration date cannot be in the past'; end if;
    if a.applicant_user_id is not null then
      if length(trim(coalesce(staff_note,'')))<5 then raise exception 'Explain how the applicant identity was verified'; end if;
      select auth_user_id into owner_id from public.ropers where id=m.roper_id;
      if owner_id is not null and owner_id<>a.applicant_user_id then raise exception 'This member record belongs to another sign-in account'; end if;
      if exists(select 1 from public.membership_link_requests where membership_id=m.id and status='approved' and user_id<>a.applicant_user_id) then raise exception 'This member record is connected to another account'; end if;
      if owner_id is distinct from a.applicant_user_id and not exists(select 1 from public.membership_link_requests where membership_id=m.id and user_id=a.applicant_user_id and status='approved') then
        if not exists(select 1 from auth.users where id=a.applicant_user_id and email_confirmed_at is not null) then raise exception 'The applicant must have a confirmed sign-in email'; end if;
        select id into pending_link from public.membership_link_requests where user_id=a.applicant_user_id and producer_id=a.producer_id and status='pending' for update;
        if pending_link is not null then
          update public.membership_link_requests set membership_id=m.id,status='approved',reason=trim(staff_note),reviewed_by=auth.uid(),reviewed_at=now() where id=pending_link;
        else
          insert into public.membership_link_requests(producer_id,user_id,member_number,claimant_name,account_email,status,membership_id,reason,reviewed_by,reviewed_at)
          values(a.producer_id,a.applicant_user_id,m.member_number,a.applicant_name,(select email from auth.users where id=a.applicant_user_id),'approved',m.id,trim(staff_note),auth.uid(),now());
        end if;
      end if;
    end if;
    update public.memberships set status='active',expires_on=coalesce(review_member_application.expires_on,m.expires_on) where id=m.id;
  end if;
  update public.membership_applications set status=decision,membership_id=case when decision='approved' then m.id else membership_id end,
    review_note=nullif(trim(staff_note),''),reviewed_by=auth.uid(),reviewed_at=now() where id=a.id;
end;
$$;
revoke all on function public.membership_application_prefill(uuid,uuid),public.my_membership_applications(),
  public.review_member_application(uuid,text,uuid,date,text) from public,anon;
grant execute on function public.membership_application_prefill(uuid,uuid),public.my_membership_applications(),
  public.review_member_application(uuid,text,uuid,date,text) to authenticated;
