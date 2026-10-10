begin;
select set_config('request.jwt.claims',
  (select jsonb_build_object('sub',user_id,'role','authenticated')::text
   from public.producer_staff where role='owner' order by created_at,user_id limit 1), true);
do $$
declare producer uuid; producer_slug text; prior integer; rejected boolean; public_values jsonb; request_id uuid; target_event uuid; target_form uuid; application_id uuid;
begin
  select producer_id into producer from public.producer_staff where user_id=auth.uid() and role='owner' limit 1;
  if producer is null then raise exception 'Owner fixture required'; end if;
  select revision into prior from public.producer_feature_preferences where producer_id=producer;
  prior:=coalesce(prior,0);
  perform public.save_producer_features(producer,prior,'{"funds":false,"fines":false,"suspensions":false,"profitability":false,"rules":false,"news":true,"online_entries":false,"portal":false,"handicap":false,"four_d":false,"short_rounds":false,"side_pots":false,"insurance":false,"cattle_draw":false}'::jsonb);
  if not exists(select 1 from public.producer_feature_preferences where producer_id=producer and features->>'funds'='false' and revision=prior+1) then raise exception 'Preference was not saved'; end if;
  rejected:=false;
  begin perform public.save_producer_features(producer,prior,'{}'::jsonb);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Stale save was accepted'; end if;
  rejected:=false;
  begin perform public.save_producer_features(producer,prior+1,'{"timing":false}'::jsonb);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Core toggle was accepted'; end if;
  rejected:=false;
  begin perform public.save_producer_features(producer,prior+1,'{"funds":"false"}'::jsonb);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Invalid value was accepted'; end if;
  select slug into producer_slug from public.producers where id=producer;
  public_values:=public.public_producer_features(producer_slug);
  if public_values<>'{"rules":false,"news":true,"online_entries":false,"portal":false}'::jsonb then raise exception 'Public preferences exposed staff-only settings or lost public values'; end if;
  if public.public_producer_features('missing-feature-test-producer')<>'{}'::jsonb then raise exception 'Missing producer defaults failed'; end if;
  select id into target_event from public.events where producer_id=producer limit 1;
  if target_event is null then raise exception 'Event fixture required'; end if;
  rejected:=false;
  begin
    insert into public.online_entry_submissions(producer_id,event_id,first_name,last_name,email)
    values(producer,target_event,'Feature','Check','feature-check@example.com');
  exception when others then
    if sqlerrm not like '%not accepting new online entry requests%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Disabled online entry accepted a new request'; end if;
  perform public.save_producer_features(producer,prior+1,'{}'::jsonb);
  insert into public.online_entry_submissions(producer_id,event_id,first_name,last_name,email)
    values(producer,target_event,'Feature','Check','feature-check@example.com') returning id into request_id;
  perform public.save_producer_features(producer,prior+2,'{"online_entries":false}'::jsonb);
  update public.online_entry_submissions set revision=revision where id=request_id;
  select id into target_form from public.membership_forms where producer_id=producer limit 1;
  if target_form is null then
    insert into public.membership_forms(producer_id,title) values(producer,'Feature guard test form') returning id into target_form;
  end if;
  perform public.save_producer_features(producer,prior+3,'{"membership":false}'::jsonb);
  rejected:=false;
  begin
    insert into public.membership_applications(producer_id,membership_form_id,applicant_name,responses,form_snapshot)
      values(producer,target_form,'Feature Check','{}'::jsonb,'{}'::jsonb);
  exception when others then
    if sqlerrm not like '%Online membership applications are not available%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Disabled membership application was accepted'; end if;
  perform public.save_producer_features(producer,prior+4,'{}'::jsonb);
  insert into public.membership_applications(producer_id,membership_form_id,applicant_name,responses,form_snapshot)
    values(producer,target_form,'Feature Check','{}'::jsonb,'{}'::jsonb) returning id into application_id;
  perform public.save_producer_features(producer,prior+5,'{"membership":false}'::jsonb);
  update public.membership_applications set review_note='Feature guard check' where id=application_id;
  perform set_config('request.jwt.claims','{}',true);
  rejected:=false;
  begin perform public.save_producer_features(producer,prior+6,'{}'::jsonb);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Unauthenticated save was accepted'; end if;
end $$;
set local role anon;
do $$
declare rejected boolean:=false;
begin
  if public.public_producer_features('missing-feature-test-producer')<>'{}'::jsonb then raise exception 'Anonymous public lookup failed'; end if;
  begin perform features from public.producer_feature_preferences limit 1;
  exception when insufficient_privilege then rejected:=true; end;
  if not rejected then raise exception 'Anonymous access to private preferences was allowed'; end if;
end $$;
rollback;
