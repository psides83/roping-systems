begin;
do $$
declare owner_id uuid := gen_random_uuid(); outsider uuid := gen_random_uuid(); failed boolean;
begin
  insert into auth.users(id,email) values(owner_id,'mfa-owner-test@example.invalid'),(outsider,'mfa-outsider-test@example.invalid');
  insert into public.platform_owners(user_id) values(owner_id);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims','{"aal":"aal1","session_id":"mfa-test"}',true);
  if not public.is_platform_owner_identity() or public.is_platform_owner() then raise exception 'Identity must not grant unverified privileges'; end if;
  failed:=false;
  begin perform public.platform_producer_directory(); exception when others then failed:=true; end;
  if not failed then raise exception 'Unverified owner read private directory'; end if;
  failed:=false;
  begin perform public.provision_producer('MFA Test','mfa-unverified-test','mfa-owner-test@example.invalid'); exception when others then failed:=true; end;
  if not failed then raise exception 'Unverified owner created producer'; end if;
  failed:=false;
  begin perform public.record_platform_verified_session(); exception when others then failed:=true; end;
  if not failed then raise exception 'Unverified owner wrote security history'; end if;
  perform set_config('request.jwt.claims','{"aal":"aal2","session_id":"mfa-test"}',true);
  if not public.is_platform_owner() then raise exception 'Verified owner denied'; end if;
  perform public.platform_producer_directory();
  perform public.record_platform_verified_session();
  perform public.record_platform_verified_session();
  if (select count(*) from public.platform_security_history where user_id=owner_id)<>1 then raise exception 'Session history duplicated'; end if;
  perform set_config('request.jwt.claim.sub',outsider::text,true);
  if public.is_platform_owner() or public.is_platform_owner_identity() then raise exception 'MFA elevated nonowner'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims','{}',true);
  if public.is_platform_owner() then raise exception 'Missing assurance allowed access'; end if;
end $$;
set local role authenticated;
do $$
begin
  if exists(select 1 from public.platform_producer_accounts) then raise exception 'Unverified owner read private account rows directly'; end if;
  if exists(select 1 from public.platform_security_history) then raise exception 'Unverified owner read security history directly'; end if;
end $$;
reset role;
rollback;
