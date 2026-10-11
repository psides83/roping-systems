begin;
do $$
declare owner_id uuid; customer uuid:=gen_random_uuid(); created record; tenant uuid; version text; result jsonb;
  count_before bigint; blocked boolean; contact_id uuid; event_id uuid;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(customer,'platform-customer-'||customer||'@example.com',now(),'{"first_name":"Sample","last_name":"Producer"}');
  perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select * into created from public.provision_platform_producer('Platform account regression','platform-admin-'||gen_random_uuid(),'platform-customer-'||customer||'@example.com','Sample Producer','2545550101','pending');
  tenant:=created.producer_id;
  if (select status from public.platform_producer_accounts where producer_id=tenant)<>'pending' then raise exception 'Pending status not saved'; end if;
  if (select count(*) from public.platform_onboarding_tasks where producer_id=tenant)<>7 then raise exception 'Onboarding tasks missing'; end if;
  perform set_config('request.jwt.claim.sub',customer::text,true);
  blocked:=false;
  begin perform public.accept_staff_invitation(created.invitation_id); exception when others then
    if sqlerrm not like 'This producer account is not currently available%' then raise; end if; blocked:=true;
  end;
  if not blocked then raise exception 'Pending invitation accepted'; end if;
  blocked:=false;
  begin perform public.platform_producer_directory(); exception when others then
    if sqlerrm<>'Platform owner access is required' then raise; end if; blocked:=true;
  end;
  if not blocked then raise exception 'Customer read private directory'; end if;
  blocked:=false;
  begin perform public.manage_platform_producer(tenant,'note','{"body":"Unauthorized"}'); exception when others then
    if sqlerrm not in ('Platform owner access is required','Platform owner two-factor verification is required') then raise; end if; blocked:=true;
  end;
  if not blocked then raise exception 'Customer changed platform notes'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select updated_at::text into version from public.platform_producer_accounts where producer_id=tenant;
  perform public.manage_platform_producer(tenant,'account',jsonb_build_object('status','setup','expectedUpdatedAt',version,'reason','Approved onboarding','nextAction','Review their templates','followUpOn','2026-10-15'));
  if not exists(select 1 from public.platform_producer_accounts where producer_id=tenant and approved_by=owner_id and approved_at is not null) then raise exception 'Approval attribution missing'; end if;
  blocked:=false;
  begin perform public.manage_platform_producer(tenant,'account',jsonb_build_object('status','active','expectedUpdatedAt',version,'reason','Stale test update')); exception when others then
    if sqlerrm not like 'This account changed in another session%' then raise; end if; blocked:=true;
  end;
  if not blocked then raise exception 'Stale update overwrote account'; end if;
  perform set_config('request.jwt.claim.sub',customer::text,true);
  perform public.accept_staff_invitation(created.invitation_id);
  if not public.can_manage_organization(tenant) then raise exception 'Approved customer lacks normal management access'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  insert into public.events(producer_id,title,slug,starts_at,status) values(tenant,'Platform permission fixture','platform-event-'||gen_random_uuid(),now(),'draft') returning id into event_id;
  perform public.manage_platform_producer(tenant,'note','{"body":"Private onboarding note"}');
  perform public.manage_platform_producer(tenant,'task','{"key":"owner","done":true}');
  perform public.manage_platform_producer(tenant,'contact','{"id":"","name":"Finance Contact","email":"finance@example.com","phone":"","responsibility":"Billing","isPrimary":true}');
  if (select count(*) from public.platform_producer_contacts where producer_id=tenant and is_primary)<>1 then raise exception 'More than one primary contact'; end if;
  select id into contact_id from public.platform_producer_contacts where producer_id=tenant and is_primary;
  perform public.manage_platform_producer(tenant,'archive_contact',jsonb_build_object('id',contact_id,'reason','Contact no longer responsible'));
  if not exists(select 1 from public.platform_producer_contacts where id=contact_id and archived_at is not null and not is_primary) then raise exception 'Contact history not preserved'; end if;
  result:=public.platform_producer_detail(tenant);
  if result->'staff'->1->>'name' is null and result->'staff'->0->>'name' is null then raise exception 'Staff names not provided'; end if;
  if jsonb_array_length(result->'notes')<>1 then raise exception 'Private note missing'; end if;
  select count(*) into count_before from public.producer_staff where producer_id=tenant;
  select updated_at::text into version from public.platform_producer_accounts where producer_id=tenant;
  blocked:=false;
  begin perform public.manage_platform_producer(tenant,'account',jsonb_build_object('status','suspended','expectedUpdatedAt',version,'reason','Suspend test account')); exception when others then
    if sqlerrm<>'Confirm that staff access will be blocked' then raise; end if; blocked:=true;
  end;
  if not blocked then raise exception 'Suspension without confirmation accepted'; end if;
  perform public.manage_platform_producer(tenant,'account',jsonb_build_object('status','suspended','expectedUpdatedAt',version,'reason','Suspend test account','confirmed',true));
  perform set_config('request.jwt.claim.sub',customer::text,true);
  if public.has_organization_access(tenant) or public.can_manage_organization(tenant) or public.can_manage_finances(tenant) then raise exception 'Suspended staff retained access'; end if;
  if public.can_time_event(event_id) or public.can_enter_event(event_id) or public.can_manage_event(event_id) or public.can_finance_event(event_id) then raise exception 'Suspension did not block event workflows'; end if;
  if not exists(select 1 from public.my_producer_account_statuses() where producer_id=tenant and status='suspended') then raise exception 'Suspended customer cannot see account status'; end if;
  blocked:=false;
  begin perform public.invite_producer_staff(tenant,'new-staff@example.com','viewer'); exception when others then
    if sqlerrm not like 'This producer account is not currently available%' then raise; end if; blocked:=true;
  end;
  if not blocked then raise exception 'Direct role-based invitation bypassed suspension'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if (select count(*) from public.producer_staff where producer_id=tenant)<>count_before then raise exception 'Suspension deleted staff'; end if;
  select updated_at::text into version from public.platform_producer_accounts where producer_id=tenant;
  perform public.manage_platform_producer(tenant,'account',jsonb_build_object('status','active','expectedUpdatedAt',version,'reason','Restore test account'));
  perform set_config('request.jwt.claim.sub',customer::text,true);
  if not public.can_manage_organization(tenant) then raise exception 'Restored account still blocked'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select updated_at::text into version from public.platform_producer_accounts where producer_id=tenant;
  perform public.manage_platform_producer(tenant,'account',jsonb_build_object('status','suspended','expectedUpdatedAt',version,'reason','Final read-policy test','confirmed',true));
  perform set_config('test.platform_customer',customer::text,true);
  perform set_config('test.platform_tenant',tenant::text,true);
end $$;
set local role authenticated;
do $$ begin
  perform set_config('request.jwt.claim.sub',current_setting('test.platform_customer'),true);
  if exists(select 1 from public.platform_producer_notes) or exists(select 1 from public.platform_producer_accounts) or exists(select 1 from public.platform_account_history) then raise exception 'Platform metadata leaked through table RLS'; end if;
  if has_table_privilege('authenticated','public.platform_producer_accounts','update') then raise exception 'Direct account status changes exposed'; end if;
  if exists(select 1 from public.events where producer_id=current_setting('test.platform_tenant')::uuid) then raise exception 'Suspended staff can read private event records'; end if;
  if not exists(select 1 from public.producers where id=current_setting('test.platform_tenant')::uuid) then raise exception 'Suspended account identity is unavailable'; end if;
end $$;
reset role;
rollback;
select 'Platform account approval, suspension, contacts, notes, concurrency, and permissions passed; all changes rolled back.' as result;
