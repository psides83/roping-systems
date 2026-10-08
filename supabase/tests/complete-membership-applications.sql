begin;
do $$
declare staff uuid; producer uuid; form uuid; account uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid();
  email text:=account::text||'@example.com'; application uuid; receipt jsonb; token text; replacement text;
  member_id uuid; classes uuid[]; draft jsonb; before_count integer; result jsonb; late_account uuid:=gen_random_uuid();
begin
  select u.id into strict staff from auth.users u where lower(u.email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',staff::text,true);
  select id into strict producer from public.producers where public.can_manage_organization(id) order by id limit 1;
  insert into public.membership_forms(producer_id,publication_state,require_signature,standard_fields)
    values(producer,'published',false,'[{"key":"first_name","required":true},{"key":"last_name","required":true},{"key":"email","required":true}]')
    on conflict(producer_id) do update set publication_state='published',require_signature=false,
      release_text=null,standard_fields=excluded.standard_fields,custom_sections='[]' returning id into form;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (account,email,now(),'{}'),(stranger,stranger::text||'@example.com',now(),'{}');
  select coalesce(array_agg(id),'{}'::uuid[]) into classes from (select distinct on(division_id) id from public.classifications
    where producer_id=producer and is_active and eligibility_type='skill' order by division_id,rank desc) c;
  draft:=jsonb_build_object('firstName','June','lastName','Marshall','memberNumber','APP-'||substr(account::text,1,8),
    'email',email,'phone','(940) 555-0123','birthDate','1995-04-01','gender','female','classifications',to_jsonb(classes));
  perform set_config('request.jwt.claim.sub','',true);
  receipt:=public.submit_membership_application_with_receipt(form,jsonb_build_object('first_name','June','last_name','Marshall',
    'email',email,'city','Glen Rose','state','Texas','custom_trailer','Two horse'),false,null);
  application:=(receipt->>'applicationId')::uuid;
  token:=split_part(receipt->>'receiptCode','.',2);
  if length(token)<>64 or exists(select 1 from public.membership_application_receipts where application_id=application and token_hash=token) then raise exception 'Receipt token not secure'; end if;
  select count(*) into before_count from public.memberships;
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  begin
    perform public.approve_member_application_with_record(application,'approved',null,current_date+365,'Verified application',draft);
    raise exception 'Applicant approved own membership';
  exception when raise_exception then if sqlerrm not like '%management access%' then raise; end if; end;
  begin
    perform public.claim_membership_application(application,token);
    raise exception 'Wrong account claimed application';
  exception when raise_exception then if sqlerrm not like '%email provided%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',account::text,true);
  begin
    perform public.claim_membership_application(application,repeat('0',64));
    raise exception 'Invalid receipt claimed application';
  exception when raise_exception then if sqlerrm not like '%invalid or expired%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  member_id:=public.approve_member_application_with_record(application,'approved',null,current_date+365,'Verified original application and contact details',draft);
  if (select count(*) from public.memberships)<>before_count+1 then raise exception 'Approval did not create exactly one member'; end if;
  if not exists(select 1 from public.memberships where id=member_id and status='active'
    and expires_on=current_date+365 and profile_fields->>'city'='Glen Rose' and profile_fields->>'custom_trailer'='Two horse') then raise exception 'Member details lost'; end if;
  if (select count(*) from public.membership_classification_history where membership_id=member_id and ended_on is null)<>cardinality(classes) then raise exception 'Starting classifications not assigned'; end if;
  if not exists(select 1 from public.membership_applications where id=application and responses->>'custom_trailer'='Two horse' and form_snapshot is not null) then raise exception 'Original application lost'; end if;
  begin
    perform public.approve_member_application_with_record(application,'approved',null,current_date+365,'Repeat approval',draft);
    raise exception 'Repeat approval succeeded';
  exception when raise_exception then if sqlerrm not like '%already been reviewed%' then raise; end if; end;
  replacement:=public.issue_membership_application_receipt(application);
  perform set_config('request.jwt.claim.sub',account::text,true);
  begin
    perform public.claim_membership_application(application,token);
    raise exception 'Replaced token succeeded';
  exception when raise_exception then if sqlerrm not like '%invalid or expired%' then raise; end if; end;
  perform public.claim_membership_application(application,split_part(replacement,'.',2));
  if not public.owns_membership(member_id) or jsonb_array_length(public.my_membership_applications()->'applications')<>1 then raise exception 'Approved anonymous application not linked'; end if;
  perform public.claim_membership_application(application,split_part(replacement,'.',2));
  receipt:=public.submit_membership_application_with_receipt(form,jsonb_build_object('first_name','June','last_name','Marshall','email',email),false,null);
  application:=(receipt->>'applicationId')::uuid;
  if receipt->>'receiptCode' is not null then raise exception 'Signed-in application should not issue a bearer receipt'; end if;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  begin
    perform public.approve_member_application_with_record(application,'approved',null,current_date+730,'Attempt duplicate renewal',draft);
    raise exception 'Renewal created another record';
  exception when raise_exception then if sqlerrm not like '%renewal must keep%' then raise; end if; end;
  perform public.approve_member_application_with_record(application,'approved',member_id,current_date+730,'Verified renewal',null);
  if (select count(*) from public.memberships)<>before_count+1 then raise exception 'Renewal duplicated member'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  receipt:=public.submit_membership_application_with_receipt(form,jsonb_build_object('first_name','Colt','last_name','Parker','email',stranger::text||'@example.com'),false,null);
  application:=(receipt->>'applicationId')::uuid; token:=split_part(receipt->>'receiptCode','.',2);
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  update auth.users set email_confirmed_at=null where id=stranger;
  begin
    perform public.claim_membership_application(application,token);
    raise exception 'Unconfirmed account claimed application';
  exception when raise_exception then if sqlerrm not like '%Confirm your sign-in email%' then raise; end if; end;
  update auth.users set email_confirmed_at=now() where id=stranger;
  update public.membership_application_receipts set expires_at=now()-interval '1 day' where application_id=application;
  begin
    perform public.claim_membership_application(application,token);
    raise exception 'Expired receipt claimed application';
  exception when raise_exception then if sqlerrm not like '%invalid or expired%' then raise; end if; end;
  update public.membership_application_receipts set expires_at=now()+interval '90 days' where application_id=application;
  perform public.claim_membership_application(application,token);
  if (select status from public.membership_applications where id=application)<>'pending' then raise exception 'Receipt claim bypassed staff approval'; end if;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  draft:=draft||jsonb_build_object('firstName','Colt','lastName','Parker','email',stranger::text||'@example.com');
  begin
    perform public.approve_member_application_with_record(application,'approved',null,current_date+365,'Duplicate member number',draft);
    raise exception 'Duplicate member number accepted';
  exception when unique_violation then null; end;
  if (select count(*) from public.memberships)<>before_count+1 or (select status from public.membership_applications where id=application)<>'pending' then raise exception 'Failed approval left partial records'; end if;
  draft:=draft||jsonb_build_object('memberNumber','APP-'||substr(stranger::text,1,8));
  member_id:=public.approve_member_application_with_record(application,'approved',null,current_date+365,'Verified pending claimant',draft);
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  if not public.owns_membership(member_id) then raise exception 'Claim-before-approval did not connect membership'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  receipt:=public.submit_membership_application_with_receipt(form,jsonb_build_object('first_name','Lena','last_name','West','email',late_account::text||'@example.com'),false,null);
  application:=(receipt->>'applicationId')::uuid; token:=split_part(receipt->>'receiptCode','.',2);
  perform set_config('request.jwt.claim.sub',staff::text,true);
  draft:=draft||jsonb_build_object('firstName','Lena','lastName','West','email',late_account::text||'@example.com','memberNumber','APP-'||substr(late_account::text,1,8));
  member_id:=public.approve_member_application_with_record(application,'approved',null,current_date+365,'Verified anonymous applicant',draft);
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(late_account,late_account::text||'@example.com',now(),'{}');
  perform set_config('request.jwt.claim.sub',late_account::text,true);
  if public.owns_membership(member_id) then raise exception 'Late signup claimed membership by email alone'; end if;
  perform public.claim_membership_application(application,token);
  if not public.owns_membership(member_id) or not exists(select 1 from public.membership_link_requests where membership_id=member_id and user_id=late_account and status='approved') then raise exception 'Late signup receipt did not connect approved membership'; end if;
  if has_table_privilege('authenticated','public.membership_application_receipts','select')
    or has_function_privilege('anon','public.claim_membership_application(uuid,text)','execute')
    or has_function_privilege('anon','public.approve_member_application_with_record(uuid,text,uuid,date,text,jsonb)','execute') then raise exception 'Private membership helpers exposed'; end if;
end; $$;
rollback;
