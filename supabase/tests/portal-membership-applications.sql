begin;
do $$
declare staff uuid; account uuid:=gen_random_uuid(); member uuid; producer uuid; roper uuid; form uuid; application uuid; blocked boolean; before_count integer; before_birth date;
begin
  select id into strict staff from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',staff::text,true);
  select m.id,m.producer_id,m.roper_id into strict member,producer,roper from public.memberships m where public.can_manage_organization(m.producer_id) limit 1;
  insert into public.membership_forms(producer_id,publication_state,require_signature,standard_fields)
    values(producer,'published',true,'[{"key":"first_name","required":true},{"key":"last_name","required":true}]')
    on conflict(producer_id) do update set publication_state='published',require_signature=true returning id into form;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(account,'application-test-'||account::text||'@example.com',now(),'{}');
  update public.ropers set auth_user_id=null where auth_user_id=account;
  update public.ropers set auth_user_id=account where id=roper;
  update public.memberships set expires_on=current_date+30 where id=member;
  select count(*) into before_count from public.memberships;
  select birth_date into before_birth from public.ropers where id=roper;
  perform set_config('request.jwt.claim.sub',account::text,true);
  application:=public.submit_membership_renewal(form,member,'{"first_name":"Cole","last_name":"Smith","birth_date":"1901-01-01"}',true,'Cole Smith');
  if not exists(select 1 from public.membership_applications where id=application and applicant_user_id=account and membership_id=member and application_kind='renewal') then raise exception 'Renewal ownership not captured'; end if;
  if jsonb_array_length(public.my_membership_applications()->'applications')<>1 then raise exception 'Own application missing'; end if;
  if public.my_membership_applications()::text like '%review_note%' then raise exception 'Private review note exposed'; end if;
  blocked:=false;
  begin perform public.submit_membership_application(form,'{"first_name":"Cole","last_name":"Smith"}',true,'Cole Smith'); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Duplicate pending application accepted'; end if;
  blocked:=false;
  begin perform public.review_member_application(application,'approved',member,current_date+365,'Verified member identity'); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Roper approved own renewal'; end if;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  blocked:=false;
  begin perform public.review_member_application(application,'approved',member,null,'Verified member identity'); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Renewal without expiry approved'; end if;
  perform public.review_member_application(application,'approved',member,current_date+365,'Verified member identity');
  if (select expires_on from public.memberships where id=member)<>current_date+365 then raise exception 'Expiration not extended'; end if;
  if (select count(*) from public.memberships)<>before_count then raise exception 'Renewal duplicated member'; end if;
  if (select birth_date from public.ropers where id=roper) is distinct from before_birth then raise exception 'Application changed eligibility without profile review'; end if;
  -- A new applicant cannot see or claim a member until staff explicitly verify them.
  update public.ropers set auth_user_id=null where id=roper;
  perform set_config('request.jwt.claim.sub',account::text,true);
  application:=public.submit_membership_application(form,'{"first_name":"Cole","last_name":"Smith"}',true,'Cole Smith');
  if not exists(select 1 from public.membership_applications where id=application and application_kind='application') then raise exception 'New application misclassified'; end if;
  if public.owns_membership(member) then raise exception 'Submission itself claimed member'; end if;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  perform public.review_member_application(application,'approved',member,current_date+400,'Verified against existing membership phone');
  perform set_config('request.jwt.claim.sub',account::text,true);
  if not public.owns_membership(member) then raise exception 'Verified application did not connect record'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if jsonb_array_length(public.my_membership_applications()->'applications')<>0 then raise exception 'Application history leaked'; end if;
  blocked:=false;
  begin perform public.membership_application_prefill(member,form); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Unlinked prefill leaked'; end if;
  if has_function_privilege('authenticated','public.submit_membership_application_internal(uuid,jsonb,boolean,text)','EXECUTE') then raise exception 'Internal submission bypass granted'; end if;
end;
$$;
rollback;
