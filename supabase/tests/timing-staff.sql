begin;
do $$
declare platform_user uuid; timing_user uuid := gen_random_uuid(); target record;
  other_run uuid; readings numeric[]; invitation uuid;
begin
  select id into strict platform_user from auth.users where lower(email)='psides83@hotmail.com';
  select run.id,run.producer_id,r.event_id,r.timer_count into strict target
    from public.competition_runs run join public.event_ropings r on r.id=run.event_roping_id
    join public.events e on e.id=r.event_id where e.status='in_progress' and run.draw_position is not null
    order by run.id limit 1;
  select run.id into strict other_run from public.competition_runs run join public.event_ropings r on r.id=run.event_roping_id
    where r.event_id<>target.event_id order by run.id limit 1;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    values(timing_user,'timing-' || timing_user::text || '@example.com',now(),'{}');
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  invitation := public.invite_producer_staff(target.producer_id,'timing-' || timing_user::text || '@example.com','timing_staff');
  perform set_config('request.jwt.claim.sub',timing_user::text,true);
  perform public.accept_staff_invitation(invitation);
  if public.can_time_run(target.id) then raise exception 'Unassigned timing staff can time run'; end if;
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  perform public.assign_staff_event(target.producer_id,target.event_id,timing_user,true);
  -- Prepare an existing run for rollback-only recording and correction checks.
  update public.competition_runs set status='pending' where id=target.id;
  delete from public.event_roping_rounds where event_roping_id=(select event_roping_id from public.competition_runs where id=target.id);
  select array_agg(12.34::numeric) into readings from generate_series(1,target.timer_count);
  perform set_config('request.jwt.claim.sub',timing_user::text,true);
  execute 'set local role authenticated';
  if not public.can_time_run(target.id) or public.can_time_run(other_run) then raise exception 'Assignment scope incorrect'; end if;
  if public.can_manage_organization(target.producer_id) or public.can_administer_organization(target.producer_id) then
    raise exception 'Timing staff inherited management access';
  end if;
  if has_function_privilege('authenticated','public.record_run_result_multi(uuid,numeric[],numeric,public.run_status)','execute') then
    raise exception 'Scoring internals still exposed';
  end if;
  perform public.save_run_with_penalties(target.id,readings,'{}','complete');
  perform public.save_run_with_penalties(target.id,readings,'{}','complete','Timing test correction');
  update public.competition_runs set raw_time_seconds=999 where id=target.id;
  if found then raise exception 'Timing staff can bypass scoring workflow'; end if;
  update public.roping_templates set id=id where producer_id=target.producer_id;
  if found then raise exception 'Timing staff can edit templates'; end if;
  update public.roping_entries set id=id where producer_id=target.producer_id;
  if found then raise exception 'Timing staff can edit entries'; end if;
  update public.producer_funds set id=id where producer_id=target.producer_id;
  if found then raise exception 'Timing staff can edit funds'; end if;
  update public.roping_funding set id=id where producer_id=target.producer_id;
  if found then raise exception 'Timing staff can change added money'; end if;
  perform public.save_run_with_penalties(target.id,'{}','{}','rerun','Timing test rerun');
  perform public.schedule_run_rerun(target.id,'immediate','Timing test reschedule');
  begin
    perform public.save_run_with_penalties(other_run,readings,'{}','complete');
    raise exception 'Unassigned event run changed';
  exception when others then
    if sqlerrm <> 'You do not have permission to access run penalties' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',platform_user::text,true);
  perform public.assign_staff_event(target.producer_id,target.event_id,timing_user,false);
  perform set_config('request.jwt.claim.sub',timing_user::text,true);
  if public.can_time_run(target.id) then raise exception 'Removed assignment retained timing access'; end if;
end;
$$;
rollback;
