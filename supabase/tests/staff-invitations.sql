begin;
do $$
declare owner_id uuid; admin_id uuid:=gen_random_uuid(); viewer_id uuid:=gen_random_uuid();
  tenant uuid; invitation uuid; another uuid;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    values(admin_id,'staff-test-'||admin_id::text||'@example.com',now(),'{}'),
      (viewer_id,'staff-test-'||viewer_id::text||'@example.com',now(),'{}');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  tenant:=public.create_organization('Invitation test','invitation-test-'||gen_random_uuid()::text);
  invitation:=public.invite_producer_staff(tenant,'staff-test-'||admin_id::text||'@example.com','admin');
  perform set_config('request.jwt.claim.sub',viewer_id::text,true);
  begin
    perform public.accept_staff_invitation(invitation);
    raise exception 'Wrong-email acceptance succeeded';
  exception when others then if sqlerrm not like '%Invitation unavailable%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',admin_id::text,true);
  if not exists(select 1 from public.my_staff_invitations() where id=invitation) then raise exception 'Matching invitation missing'; end if;
  perform public.accept_staff_invitation(invitation);
  begin
    perform public.invite_producer_staff(tenant,'staff-test-'||viewer_id::text||'@example.com','admin');
    raise exception 'Admin privilege escalation succeeded';
  exception when others then if sqlerrm not like '%only lower-level%' then raise; end if; end;
  another:=public.invite_producer_staff(tenant,'staff-test-'||viewer_id::text||'@example.com','viewer');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.manage_producer_staff(tenant,admin_id,'viewer');
  perform set_config('request.jwt.claim.sub',viewer_id::text,true);
  begin
    perform public.accept_staff_invitation(another);
    raise exception 'Revoked inviter authority accepted';
  exception when others then if sqlerrm not like '%requires an owner%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.cancel_staff_invitation(another);
  another:=public.invite_producer_staff(tenant,'staff-test-'||viewer_id::text||'@example.com','viewer');
  update public.producer_staff_invitations set expires_at=now()-interval '1 second' where id=another;
  perform set_config('request.jwt.claim.sub',viewer_id::text,true);
  begin
    perform public.accept_staff_invitation(another);
    raise exception 'Expired invitation accepted';
  exception when others then if sqlerrm not like '%Invitation unavailable%' then raise; end if; end;
  if has_table_privilege('authenticated','public.producer_staff','insert') then raise exception 'Direct staff insertion allowed'; end if;
  if not exists(select 1 from public.producer_audit_log where producer_id=tenant and entity_type='producer_staff_invitations') then raise exception 'Invitation audit missing'; end if;
end;
$$;
rollback;
