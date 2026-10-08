-- Runs against existing fixtures but never retains users, assignments or edits.
begin;
do $$
declare
  platform_user uuid;
  producer uuid;
  target_event_id uuid;
  other_event uuid;
  roping_id uuid;
  foreign_producer uuid;
  foreign_event uuid;
  staff_user uuid;
  staff_role text;
  broad boolean;
  administrative boolean;
  manager boolean;
  finance boolean;
  writer boolean;
  table_name text;
  changed integer;
begin
  select id into strict platform_user from auth.users where lower(email)='psides83@hotmail.com';
  select e.id,e.producer_id into strict target_event_id,producer from public.events e
    join public.producer_staff s on s.producer_id=e.producer_id and s.user_id=platform_user and s.role='owner'
    where e.status not in ('completed','cancelled') and exists(select 1 from public.event_ropings r where r.event_id=e.id)
    order by e.created_at desc limit 1;
  select e.id into strict other_event from public.events e where e.producer_id=producer and e.id<>target_event_id order by e.id limit 1;
  select r.id into strict roping_id from public.event_ropings r where r.event_id=target_event_id order by r.id limit 1;
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  foreign_producer:=public.create_organization('Rollback permission isolation','permission-isolation-'||gen_random_uuid()::text);
  insert into public.events(producer_id,title,slug,starts_at,status)
    values(foreign_producer,'Rollback foreign event','foreign',now(),'scheduled') returning id into foreign_event;
  update public.event_ropings set arena_name='Arena 1' where id=roping_id;

  foreach staff_role in array array['owner','admin','operator','event_manager','treasurer','entry_office','timing_staff','viewer'] loop
    staff_user:=gen_random_uuid();
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
      values(staff_user,'permission-'||staff_user::text||'@example.com',now(),'{}');
    insert into public.producer_staff(producer_id,user_id,role)
      values(producer,staff_user,staff_role::public.organization_role);
    broad:=staff_role in ('owner','admin','operator');
    administrative:=staff_role in ('owner','admin');
    manager:=broad or staff_role='event_manager';
    finance:=broad or staff_role='treasurer';

    perform set_config('request.jwt.claim.sub',staff_user::text,true);
    execute 'set local role authenticated';
    if public.can_manage_organization(producer) is distinct from broad
      or public.can_administer_organization(producer) is distinct from administrative
      or public.can_manage_finances(producer) is distinct from finance
      or public.can_manage_event(target_event_id) is distinct from broad
      or public.can_enter_event(target_event_id) is distinct from broad
      or public.can_time_event(target_event_id) is distinct from broad then
      raise exception 'Unassigned % permissions incorrect',staff_role;
    end if;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub',platform_user::text,true);
    perform public.assign_staff_event(producer,target_event_id,staff_user,true);
    perform set_config('request.jwt.claim.sub',staff_user::text,true);
    execute 'set local role authenticated';
    if public.can_manage_event(target_event_id) is distinct from manager
      or public.can_enter_event(target_event_id) is distinct from (manager or staff_role='entry_office')
      or public.can_time_roping(roping_id) is distinct from (manager or staff_role='timing_staff')
      or public.can_finance_event(target_event_id) is distinct from finance
      or public.can_adjust_event_finances(target_event_id) is distinct from (manager or finance)
      or public.can_collect_event(target_event_id) is distinct from (manager or finance or staff_role='entry_office') then
      raise exception 'Assigned % permissions incorrect',staff_role;
    end if;
    if public.can_manage_event(other_event) is distinct from broad
      or public.can_enter_event(other_event) is distinct from broad
      or public.can_time_event(other_event) is distinct from broad then
      raise exception '% escaped event assignment',staff_role;
    end if;
    if public.has_organization_access(foreign_producer) or public.can_manage_organization(foreign_producer)
      or public.can_administer_organization(foreign_producer) or public.can_manage_finances(foreign_producer)
      or public.can_manage_event(foreign_event) or public.can_enter_event(foreign_event)
      or public.can_time_event(foreign_event) or public.can_finance_event(foreign_event) then
      raise exception '% gained cross-producer access',staff_role;
    end if;

    -- Actual RPC calls, not just permission predicates.
    begin
      perform public.set_event_publication(target_event_id,'draft');
      if not manager then raise exception '% changed event publication',staff_role; end if;
    exception when others then
      if manager or sqlerrm<>'Event management access is required' then raise; end if;
    end;
    begin
      perform public.assign_staff_event(producer,other_event,staff_user,true);
      if not administrative then raise exception '% assigned themselves to an event',staff_role; end if;
    exception when others then
      if administrative or sqlerrm<>'Event assignments require an owner or administrator.' then raise; end if;
    end;
    begin
      perform public.create_organization('Unauthorized producer','unauthorized-'||staff_user::text);
      raise exception '% created a producer without platform-owner access',staff_role;
    exception when others then
      if sqlerrm not like '%Only the platform owner%' then raise; end if;
    end;
    if has_function_privilege('authenticated','public.apply_short_round_settings(uuid,uuid,boolean,jsonb)','execute')
      or has_function_privilege('authenticated','public.apply_template_short_round_settings(uuid)','execute') then
      raise exception 'Private short-round helpers remain exposed';
    end if;
    begin
      perform public.apply_short_round_settings(producer,roping_id,false,'[]');
      raise exception '% bypassed short-round workflow',staff_role;
    exception when insufficient_privilege then null; end;

    -- Verify direct table writes cannot bypass the staff-facing RPCs.
    foreach table_name in array array['roping_templates','classifications','memberships','events','producer_funds'] loop
      writer:=broad;
      execute format('update public.%I set id=id where producer_id=$1',table_name) using producer;
      get diagnostics changed=row_count;
      if not writer and changed>0 then raise exception '% directly edited %',staff_role,table_name; end if;
      execute format('update public.%I set id=id where producer_id=$1',table_name) using foreign_producer;
      get diagnostics changed=row_count;
      if changed>0 then raise exception '% directly edited another producer %',staff_role,table_name; end if;
    end loop;
    if has_table_privilege('authenticated','public.competition_runs','update') then
      raise exception 'Direct timing writes can bypass timing control';
    end if;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub',platform_user::text,true);
    perform public.assign_staff_event(producer,target_event_id,staff_user,false);
    perform set_config('request.jwt.claim.sub',staff_user::text,true);
    execute 'set local role authenticated';
    if public.can_manage_event(target_event_id) is distinct from broad
      or public.can_enter_event(target_event_id) is distinct from broad
      or public.can_time_event(target_event_id) is distinct from broad then
      raise exception '% retained a revoked assignment',staff_role;
    end if;
    execute 'reset role';
    perform set_config('request.jwt.claim.sub',platform_user::text,true);
    raise notice 'PASS: % permissions, assignments, RPCs and tenant isolation',staff_role;
  end loop;
end;
$$;
rollback;
