begin;
do $$
declare owner_id uuid:=gen_random_uuid(); tenant uuid; other_tenant uuid; archived_tenant uuid; report jsonb; today date:=(now() at time zone 'America/Chicago')::date; baseline integer; failed boolean;
begin
  insert into auth.users(id,email) values(owner_id,'health-owner-test@example.invalid');
  insert into public.platform_owners(user_id) values(owner_id);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
  select (public.platform_account_health()->'counts'->>'events')::integer into baseline;
  insert into public.producers(name,slug) values('Health Setup Fixture','health-setup-fixture') returning id into tenant;
  insert into public.producers(name,slug) values('Health Pending Fixture','health-pending-fixture') returning id into other_tenant;
  insert into public.producers(name,slug) values('Health Archived Fixture','health-archived-fixture') returning id into archived_tenant;
  update public.platform_producer_accounts set follow_up_on=today,next_action='Call producer' where producer_id=tenant;
  update public.platform_producer_accounts set status='pending',follow_up_on=today-1 where producer_id=other_tenant;
  update public.platform_producer_accounts set status='archived',follow_up_on=today-1 where producer_id=archived_tenant;
  insert into public.events(producer_id,title,slug,starts_at,ends_at,status) values
    (tenant,'Health Upcoming','health-upcoming',now()+interval '2 days',now()+interval '3 days','scheduled'),
    (tenant,'Health Draft','health-draft',now()+interval '2 days',null,'draft'),
    (tenant,'Health Old','health-old',now()-interval '3 days',now()-interval '2 days','scheduled'),
    (tenant,'Health Cancelled','health-cancelled',now()+interval '2 days',null,'cancelled'),
    (archived_tenant,'Health Archived','health-archived',now()+interval '2 days',null,'scheduled');
  report:=public.platform_account_health('followup');
  if not exists(select 1 from jsonb_array_elements(report->'accounts') x where x->>'id'=tenant::text and (x->>'due_followup')::boolean) then raise exception 'Today follow-up missing'; end if;
  if exists(select 1 from jsonb_array_elements(report->'accounts') x where x->>'id'=archived_tenant::text) then raise exception 'Archived account in attention'; end if;
  if (report->'counts'->>'events')::integer<>baseline+1 then raise exception 'Event window included invalid events'; end if;
  report:=public.platform_account_health('approval');
  if not exists(select 1 from jsonb_array_elements(report->'accounts') x where x->>'id'=other_tenant::text) then raise exception 'Pending approval missing'; end if;
  if exists(select 1 from jsonb_array_elements(report->'accounts') x where x->>'id'=tenant::text) then raise exception 'Setup account matched approval'; end if;
  update public.platform_onboarding_tasks set completed_at=now() where producer_id=tenant;
  report:=public.platform_account_health('setup');
  if exists(select 1 from jsonb_array_elements(report->'accounts') x where x->>'id'=tenant::text) then raise exception 'Completed setup flagged incomplete'; end if;
  perform set_config('request.jwt.claims','{"aal":"aal1"}',true);
  failed:=false;
  begin perform public.platform_account_health(); exception when others then failed:=true; end;
  if not failed then raise exception 'Unverified owner read health'; end if;
  perform set_config('request.jwt.claims','{"aal":"aal2"}',true);
  failed:=false;
  begin perform public.platform_account_health('invalid'); exception when others then failed:=true; end;
  if not failed then raise exception 'Invalid filter allowed'; end if;
end $$;
rollback;
