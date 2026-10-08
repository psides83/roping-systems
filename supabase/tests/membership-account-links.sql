begin;
do $$
declare staff uuid; claimant uuid:=gen_random_uuid(); target uuid; producer uuid; slug text; other_member uuid; request uuid; blocked boolean; existing_email text;
begin
  select id into strict staff from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',staff::text,true);
  select m.id,m.producer_id,p.slug into strict target,producer,slug from public.memberships m
    join public.producers p on p.id=m.producer_id where public.can_manage_organization(m.producer_id) limit 1;
  update public.ropers set auth_user_id=null where id=(select roper_id from public.memberships where id=target);
  existing_email:='link-test-'||claimant::text||'@example.com';
  update public.ropers set email=existing_email where id=(select roper_id from public.memberships where id=target);
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    values(claimant,existing_email,now(),'{}');
  perform set_config('request.jwt.claim.sub',claimant::text,true);
  request:=public.request_membership_link(slug,'Not a lookup token','Test Roper');
  if public.owns_membership(target) or jsonb_array_length(public.my_roper_portal()->'memberships')<>0 then raise exception 'Pending request granted access'; end if;
  perform set_config('role','authenticated',true);
  blocked:=false;
  begin update public.membership_link_requests set status='approved',membership_id=target where id=request;
    if found then raise exception 'Direct client approval allowed'; end if;
    blocked:=true;
  exception when insufficient_privilege then blocked:=true; end;
  perform set_config('role','postgres',true);
  if not blocked then raise exception 'Request write policy failed'; end if;
  blocked:=false;
  begin perform public.review_membership_link(request,'approved',target,'Verified by phone'); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Claimant approved own request'; end if;
  blocked:=false;
  begin perform public.request_membership_link(slug,'Other','Test Roper'); exception when raise_exception then blocked:=true; end;
  if not blocked then raise exception 'Duplicate pending request allowed'; end if;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  select id into other_member from public.memberships where producer_id<>producer limit 1;
  if other_member is not null then
    blocked:=false;
    begin perform public.review_membership_link(request,'approved',other_member,'Verified by phone'); exception when raise_exception then blocked:=true; end;
    if not blocked then raise exception 'Cross-producer approval allowed'; end if;
  end if;
  perform public.review_membership_link(request,'approved',target,'Verified using existing phone contact');
  perform set_config('request.jwt.claim.sub',claimant::text,true);
  if not public.owns_membership(target) or jsonb_array_length(public.my_roper_portal()->'memberships')<>1 then raise exception 'Approved membership scope incorrect'; end if;
  perform public.my_roper_accounts(target);
  perform public.my_roper_bonus_positions(target);
  perform public.my_roper_standings_context(target);
  if other_member is not null and public.owns_membership(other_member) then raise exception 'Another producer membership leaked'; end if;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  perform public.review_membership_link(request,'revoked',null,'Connection revoked after verification correction');
  perform set_config('request.jwt.claim.sub',claimant::text,true);
  if public.owns_membership(target) or jsonb_array_length(public.my_roper_portal()->'memberships')<>0 then raise exception 'Revocation did not remove access'; end if;
  if has_function_privilege('anon','public.request_membership_link(text,text,text)','EXECUTE') then raise exception 'Anonymous request access'; end if;
  if not exists(select 1 from public.producer_audit_log where entity_id=request and action='update') then raise exception 'Missing approval audit'; end if;
end;
$$;
rollback;
