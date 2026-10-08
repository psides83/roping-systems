create table public.run_submission_receipts (
  submission_id uuid primary key,
  run_id uuid not null references public.competition_runs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null,
  saved_at timestamptz not null default clock_timestamp()
);
alter table public.run_submission_receipts enable row level security;
revoke all on public.run_submission_receipts from public,anon,authenticated;

create function public.submit_run_result(target_run_id uuid, submission_id uuid, timing_session_id uuid,
  entered_timer_readings numeric[], selected_penalty_ids text[], entered_status public.run_status,
  expected_recorded_at timestamptz, expected_rerun_count integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare run public.competition_runs%rowtype; receipt public.run_submission_receipts%rowtype; payload jsonb; result numeric;
begin
  if auth.uid() is null or submission_id is null then raise exception 'Sign in and identify this submission before saving'; end if;
  select * into run from public.competition_runs where id=target_run_id;
  if run.id is null or not public.can_time_run(run.id) then raise exception 'Timing access changed. Check your event and arena assignment'; end if;
  -- Use the same parent lock as takeover and scoring; retries serialize with an in-flight save.
  perform 1 from public.event_ropings where id=run.event_roping_id for update;
  payload:=jsonb_build_object('times',coalesce(entered_timer_readings,'{}'),
    'penalties',coalesce((select jsonb_agg(p order by p) from unnest(selected_penalty_ids) p),'[]'::jsonb),
    'status',entered_status,'recordedAt',expected_recorded_at,'attempt',expected_rerun_count);
  select * into receipt from public.run_submission_receipts s where s.submission_id=submit_run_result.submission_id;
  if found then
    if receipt.user_id<>auth.uid() or receipt.run_id<>target_run_id or receipt.payload<>payload then
      raise exception 'This submission ID belongs to different data. Review the saved result'; end if;
    return jsonb_build_object('saved',true,'replayed',true,'savedAt',receipt.saved_at);
  end if;
  perform timing_private.assert_control(target_run_id,timing_session_id);
  select * into run from public.competition_runs where id=target_run_id for update;
  if run.status<>'pending' or run.recorded_at is distinct from expected_recorded_at or run.rerun_count is distinct from expected_rerun_count then
    raise exception 'This run changed after the draft was created. Refresh and review the saved result; your draft has not overwritten it'; end if;
  if entered_status is null or entered_status not in ('complete','no_time','disqualified','turned_out','rerun') then raise exception 'Choose a valid run outcome'; end if;
  result:=public.save_run_with_penalties(target_run_id,entered_timer_readings,selected_penalty_ids,entered_status,null,timing_session_id);
  insert into public.run_submission_receipts(submission_id,run_id,user_id,payload)
    values(submission_id,target_run_id,auth.uid(),payload) returning * into receipt;
  return jsonb_build_object('saved',true,'replayed',false,'savedAt',receipt.saved_at);
end;
$$;

create function public.run_submission_status(target_run_id uuid,target_submission_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare run public.competition_runs%rowtype; receipt public.run_submission_receipts%rowtype;
begin
  select * into run from public.competition_runs where id=target_run_id;
  if auth.uid() is null or run.id is null or not public.has_organization_access(run.producer_id) then raise exception 'This run is not available'; end if;
  perform 1 from public.event_ropings where id=run.event_roping_id for update;
  select * into receipt from public.run_submission_receipts where submission_id=target_submission_id and run_id=target_run_id and user_id=auth.uid();
  return jsonb_build_object('saved',receipt.submission_id is not null,'savedAt',receipt.saved_at);
end;
$$;
revoke all on function public.submit_run_result(uuid,uuid,uuid,numeric[],text[],public.run_status,timestamptz,integer),public.run_submission_status(uuid,uuid) from public,anon;
grant execute on function public.submit_run_result(uuid,uuid,uuid,numeric[],text[],public.run_status,timestamptz,integer),public.run_submission_status(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
