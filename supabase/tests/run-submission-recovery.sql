begin;
do $$
declare owner_id uuid; session_id uuid:=gen_random_uuid(); request_id uuid:=gen_random_uuid(); target record;
  response jsonb; first_saved timestamptz; audit_count bigint; readings numeric[];
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  select run.id,r.id roping_id,r.producer_id,r.timer_count into strict target
    from public.competition_runs run join public.event_ropings r on r.id=run.event_roping_id
    join public.events e on e.id=r.event_id where e.status='in_progress' and run.draw_position is not null
    and r.event_day_status<>'completed' and r.payouts_finalized_at is null order by run.id limit 1;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  update public.event_ropings set arena_name='Arena 1' where id=target.roping_id;
  update public.competition_runs set status='pending',recorded_at=null,rerun_count=0 where id=target.id;
  delete from public.event_roping_rounds where event_roping_id=target.roping_id;
  delete from public.roping_timing_sessions where event_roping_id=target.roping_id;
  select array_agg(12.34::numeric) into readings from generate_series(1,target.timer_count);
  execute 'set local role authenticated';
  perform public.manage_roping_timing(target.roping_id,session_id,'claim');
  response:=public.submit_run_result(target.id,request_id,session_id,readings,'{}','complete',null,0);
  if response->>'saved'<>'true' or response->>'replayed'<>'false' then raise exception 'Initial save not acknowledged'; end if;
  select recorded_at into first_saved from public.competition_runs where id=target.id;
  select count(*) into audit_count from public.producer_audit_log where entity_type='competition_runs' and entity_id=target.id;
  response:=public.submit_run_result(target.id,request_id,session_id,readings,'{}','complete',null,0);
  if response->>'replayed'<>'true' then raise exception 'Lost acknowledgment retry was not deduplicated'; end if;
  if first_saved is distinct from (select recorded_at from public.competition_runs where id=target.id) then raise exception 'Retry recorded a second result'; end if;
  if audit_count<>(select count(*) from public.producer_audit_log where entity_type='competition_runs' and entity_id=target.id) then raise exception 'Retry wrote duplicate audit records'; end if;
  begin
    perform public.submit_run_result(target.id,request_id,session_id,array_fill(99::numeric,array[target.timer_count]),'{}','complete',null,0);
    raise exception 'Submission reused with different readings';
  exception when others then if sqlerrm not like 'This submission ID belongs%' then raise; end if; end;
  begin
    perform public.submit_run_result(target.id,gen_random_uuid(),session_id,readings,'{}','complete',null,0);
    raise exception 'Stale draft overwrote completed run';
  exception when others then if sqlerrm not like 'This run changed%' then raise; end if; end;
  response:=public.run_submission_status(target.id,request_id);
  if response->>'saved'<>'true' then raise exception 'Saved status could not be recovered'; end if;
  response:=public.run_submission_status(target.id,gen_random_uuid());
  if response->>'saved'<>'false' then raise exception 'Unknown submission reported saved'; end if;
  execute 'reset role';
  update public.roping_timing_sessions set expires_at=now()-interval '1 second' where event_roping_id=target.roping_id;
  execute 'set local role authenticated';
  response:=public.submit_run_result(target.id,request_id,session_id,readings,'{}','complete',null,0);
  if response->>'replayed'<>'true' then raise exception 'Original acknowledgment needs an active timing lease'; end if;
  begin
    perform public.submit_run_result(target.id,gen_random_uuid(),session_id,readings,'{}','complete',null,0);
    raise exception 'New save bypassed expired lease';
  exception when others then if sqlerrm not like 'Take timing control%' then raise; end if; end;
  execute 'reset role';
  update public.competition_runs set status='pending',rerun_count=1 where id=target.id;
  execute 'set local role authenticated';
  perform public.manage_roping_timing(target.roping_id,session_id,'claim');
  begin
    perform public.submit_run_result(target.id,gen_random_uuid(),session_id,readings,'{}','complete',first_saved,0);
    raise exception 'Old attempt draft replaced rerun';
  exception when others then if sqlerrm not like 'This run changed%' then raise; end if; end;
  response:=public.submit_run_result(target.id,gen_random_uuid(),session_id,readings,'{}','complete',first_saved,1);
  if response->>'replayed'<>'false' then raise exception 'New rerun attempt could not be recorded'; end if;
  if has_table_privilege('authenticated','public.run_submission_receipts','SELECT') then raise exception 'Private submission payloads exposed'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.run_submission_status(target.id,request_id);
    raise exception 'Unassigned identity read saved status';
  exception when others then if sqlerrm <> 'This run is not available' then raise; end if; end;
end;
$$;
rollback;
