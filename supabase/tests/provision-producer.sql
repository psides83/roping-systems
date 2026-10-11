begin;
do $$
declare platform_user uuid; guest_user uuid := gen_random_uuid(); created record;
  tenant_slug text := 'provision-test-' || gen_random_uuid()::text;
begin
  select id into strict platform_user from auth.users where lower(email)='psides83@hotmail.com';
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    values(guest_user,'provision-' || guest_user::text || '@example.com',now(),'{}');
  perform set_config('request.jwt.claim.sub',guest_user::text,true);
  begin
    perform public.provision_producer('Unauthorized',tenant_slug,'owner@example.com');
    raise exception 'Unauthorized provisioning succeeded';
  exception when others then
    if sqlerrm <> 'Only the platform owner can create producers.' then raise; end if;
  end;
  perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  begin
    perform public.provision_producer('Invalid owner',tenant_slug,'invalid');
    raise exception 'Invalid email accepted';
  exception when others then
    if sqlerrm <> 'Enter a valid email.' then raise; end if;
  end;
  if exists(select 1 from public.producers where slug=tenant_slug) then
    raise exception 'Failed invitation left a producer behind';
  end if;
  select * into created from public.provision_producer('Provision test',tenant_slug,
    'provision-' || guest_user::text || '@example.com');
  if not exists(select 1 from public.producer_staff_invitations
    where id=created.invitation_id and producer_id=created.producer_id and role='owner') then
    raise exception 'Owner invitation missing';
  end if;
  if exists(select 1 from public.producer_staff where producer_id=created.producer_id and user_id=guest_user) then
    raise exception 'Owner access granted before acceptance';
  end if;
  perform set_config('request.jwt.claim.sub',guest_user::text,true);
  perform public.accept_staff_invitation(created.invitation_id);
  if not exists(select 1 from public.producer_staff where producer_id=created.producer_id and user_id=guest_user and role='owner') then
    raise exception 'Accepted owner access missing';
  end if;
end;
$$;
rollback;
