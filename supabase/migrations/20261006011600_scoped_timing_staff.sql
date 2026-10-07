create function public.can_time_event(target_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.events e where e.id=target_event and
    (public.can_manage_organization(e.producer_id) or exists(
      select 1 from public.producer_staff s join public.staff_event_assignments a
        on a.producer_id=s.producer_id and a.user_id=s.user_id
      where s.producer_id=e.producer_id and s.user_id=auth.uid()
        and s.role='timing_staff' and a.event_id=e.id)));
$$;
create function public.can_time_roping(target_roping uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.event_ropings r where r.id=target_roping and public.can_time_event(r.event_id));
$$;
create function public.can_time_run(target_run uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.competition_runs r where r.id=target_run and public.can_time_roping(r.event_roping_id));
$$;
revoke all on function public.can_time_event(uuid),public.can_time_roping(uuid),public.can_time_run(uuid) from public,anon;
grant execute on function public.can_time_event(uuid),public.can_time_roping(uuid),public.can_time_run(uuid) to authenticated;

-- Preserve current scoring logic while replacing only the inspected authorization checks.
do $$
declare fn record; original text; updated text;
begin
  for fn in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in
      ('record_run_result_multi','correct_run_result_multi','schedule_run_rerun','applicable_run_penalties','event_run_penalty_options') loop
    original := pg_get_functiondef(fn.oid);
    if fn.proname='event_run_penalty_options' then
      updated := replace(original,'public.can_manage_organization(r.producer_id)','public.can_time_roping(r.id)');
    elsif fn.proname='applicable_run_penalties' then
      updated := replace(original,'public.can_manage_organization(r.producer_id)','public.can_time_run(target_run_id)');
    else
      updated := replace(original,'public.can_manage_organization(run_record.producer_id)','public.can_time_run(target_run_id)');
    end if;
    if updated=original then raise exception 'Timing authorization check not found in %',fn.proname; end if;
    execute updated;
  end loop;
  original := pg_get_functiondef('public.protect_producer_staff_roles()'::regprocedure);
  updated := replace(original,'''operator'',''viewer''','''operator'',''viewer'',''timing_staff''');
  if updated=original then raise exception 'Invitation role check not found'; end if;
  execute updated;
end;
$$;
-- Only the penalty-validating public workflow may call the scoring internals.
revoke execute on function public.record_run_result_multi(uuid,numeric[],numeric,public.run_status),
  public.correct_run_result_multi(uuid,numeric[],numeric,public.run_status,text) from authenticated,anon,public;
