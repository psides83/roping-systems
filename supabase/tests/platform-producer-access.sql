begin;
do $$
declare owner_id uuid; created_producer uuid;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if not public.is_platform_owner() then raise exception 'Platform owner not recognized'; end if;
  created_producer := public.create_organization('Platform access test','platform-access-test-'||gen_random_uuid()::text);
  if not exists(select 1 from public.producer_staff where producer_staff.producer_id=created_producer and user_id=owner_id and role='owner') then
    raise exception 'Initial owner missing';
  end if;
  begin
    delete from public.producer_staff s where s.producer_id=created_producer and s.user_id=owner_id;
    raise exception 'Last owner removal succeeded';
  exception when others then
    if sqlerrm not like '%retain an owner%' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  if public.is_platform_owner() then raise exception 'Unauthorized platform owner'; end if;
  begin
    perform public.create_organization('Unauthorized test','unauthorized-test');
    raise exception 'Unauthorized producer creation succeeded';
  exception when others then
    if sqlerrm not like '%Only the platform owner%' then raise; end if;
  end;
  if has_function_privilege('authenticated','public.create_producer_internal(text,text)','execute') then
    raise exception 'Internal creation function exposed';
  end if;
  if has_table_privilege('authenticated','public.platform_owners','insert') then
    raise exception 'Platform owner escalation possible';
  end if;
end;
$$;
rollback;
