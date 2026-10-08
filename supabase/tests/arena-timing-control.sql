begin;
do $$
declare owner_id uuid; timer_id uuid:=gen_random_uuid(); second_timer uuid:=gen_random_uuid();
  session_a uuid:=gen_random_uuid(); session_b uuid:=gen_random_uuid(); session_c uuid:=gen_random_uuid();
  target record; other record; response jsonb; readings numeric[]; invite uuid;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  select run.id,run.event_roping_id,r.producer_id,r.event_id,r.timer_count into strict target
    from public.competition_runs run join public.event_ropings r on r.id=run.event_roping_id
    join public.events e on e.id=r.event_id where e.status='in_progress' and run.draw_position is not null
    and r.event_day_status<>'completed' and r.payouts_finalized_at is null order by run.id limit 1;
  select r.id event_roping_id into strict other from public.event_ropings r where r.event_id=target.event_id
    and r.id<>target.event_roping_id and r.event_day_status<>'completed' order by r.id limit 1;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  update public.events set arena_count=greatest(arena_count,2) where id=target.event_id;
  update public.event_ropings set arena_name='Arena 1' where id=target.event_roping_id;
  update public.event_ropings set arena_name='Arena 2' where id=other.event_roping_id;
  delete from public.roping_timing_sessions where event_roping_id in(target.event_roping_id,other.event_roping_id);
  delete from public.event_roping_rounds where event_roping_id=target.event_roping_id;
  update public.competition_runs set status='pending' where id=target.id;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (timer_id,'timer-'||timer_id||'@example.com',now(),'{}'),
    (second_timer,'timer-'||second_timer||'@example.com',now(),'{}');
  invite:=public.invite_producer_staff(target.producer_id,'timer-'||timer_id||'@example.com','timing_staff');
  perform set_config('request.jwt.claim.sub',timer_id::text,true);
  perform public.accept_staff_invitation(invite);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  invite:=public.invite_producer_staff(target.producer_id,'timer-'||second_timer||'@example.com','timing_staff');
  perform set_config('request.jwt.claim.sub',second_timer::text,true);
  perform public.accept_staff_invitation(invite);
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.assign_staff_event(target.producer_id,target.event_id,timer_id,true);
  perform public.assign_staff_event(target.producer_id,target.event_id,second_timer,true);
  perform public.assign_staff_arena(target.producer_id,target.event_id,timer_id,1);
  perform public.assign_staff_arena(target.producer_id,target.event_id,second_timer,2);
  select array_agg(12.34::numeric) into readings from generate_series(1,target.timer_count);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claim.sub',timer_id::text,true);
  if not public.can_time_run(target.id) or public.can_time_roping(other.event_roping_id) then raise exception 'Arena permission scope incorrect'; end if;
  if has_table_privilege('authenticated','public.competition_runs','UPDATE') or
    has_function_privilege('authenticated','public.record_run_result(uuid,numeric,numeric,public.run_status)','EXECUTE') or
    has_schema_privilege('authenticated','timing_private','USAGE') then raise exception 'A timing bypass remains'; end if;
  begin
    perform public.save_run_with_penalties(target.id,readings,'{}','complete');
    raise exception 'Missing session accepted';
  exception when others then if sqlerrm not like 'Take timing control%' then raise; end if; end;
  response:=public.manage_roping_timing(target.event_roping_id,session_a,'claim');
  if not (response->>'ownsControl')::boolean or response ? 'session_id' then raise exception 'Invalid ownership response'; end if;
  perform public.save_run_with_penalties(target.id,readings,'{}','complete',null,session_a);
  perform public.save_run_with_penalties(target.id,readings,'{}','complete','Test timing correction',session_a);
  begin
    perform public.manage_roping_timing(target.event_roping_id,session_b,'claim');
    raise exception 'Second tab acquired control';
  exception when others then if sqlerrm not like 'Another timing session%' then raise; end if; end;
  begin
    perform public.manage_roping_timing(target.event_roping_id,session_b,'takeover','Unauthorized takeover');
    raise exception 'Timer took over another tab';
  exception when others then if sqlerrm not like 'Only an event manager%' then raise; end if; end;
  begin
    perform public.manage_roping_timing(other.event_roping_id,session_b,'claim');
    raise exception 'Timer acquired wrong arena';
  exception when others then if sqlerrm not like 'Assign this roping%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',second_timer::text,true);
  response:=public.manage_roping_timing(other.event_roping_id,session_b,'claim');
  if not (response->>'ownsControl')::boolean then raise exception 'Separate arena timing blocked'; end if;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.manage_roping_timing(target.event_roping_id,session_c,'takeover','Manager taking over in test');
  perform set_config('request.jwt.claim.sub',timer_id::text,true);
  begin
    perform public.save_run_with_penalties(target.id,readings,'{}','complete','Stale tab correction',session_a);
    raise exception 'Displaced timer saved';
  exception when others then if sqlerrm not like 'Take timing control%' then raise; end if; end;
  perform public.manage_roping_timing(target.event_roping_id,session_a,'release');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  response:=public.manage_roping_timing(target.event_roping_id,session_c);
  if not (response->>'ownsControl')::boolean then raise exception 'Non-owner released control'; end if;
  perform public.save_run_with_penalties(target.id,'{}','{}','rerun','Testing controlled rerun',session_c);
  perform public.schedule_run_rerun(target.id,'immediate','Testing rerun scheduling',session_c);
  execute 'reset role';
  update public.roping_timing_sessions set expires_at=now()-interval '1 second' where event_roping_id=target.event_roping_id;
  execute 'set local role authenticated';
  begin
    perform public.save_run_with_penalties(target.id,readings,'{}','complete',null,session_c);
    raise exception 'Expired session saved';
  exception when others then if sqlerrm not like 'Take timing control%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',timer_id::text,true);
  perform public.manage_roping_timing(target.event_roping_id,session_a,'claim');
  perform public.manage_roping_timing(target.event_roping_id,session_a,'renew');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.assign_staff_arena(target.producer_id,target.event_id,timer_id,2);
  perform set_config('request.jwt.claim.sub',timer_id::text,true);
  begin
    perform public.save_run_with_penalties(target.id,readings,'{}','complete',null,session_a);
    raise exception 'Reassigned timer retained control';
  exception when others then if sqlerrm not like 'Take timing control%' then raise; end if; end;
  execute 'reset role';
  update public.event_ropings set arena_name=null where id=target.event_roping_id;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if public.can_time_roping(target.event_roping_id) then raise exception 'First Available can be timed without an arena'; end if;
end;
$$;
rollback;
