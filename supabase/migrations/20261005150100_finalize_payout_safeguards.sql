do $$
declare definition text;
begin
  select pg_get_functiondef('public.record_roper_payout(uuid,uuid,uuid,integer,text,text,boolean,text,uuid)'::regprocedure) into definition;
  definition:=replace(definition,'where a.roper_id = target_roper_id',
    'where exists (select 1 from public.event_ropings finalized where finalized.id=a.event_roping_id and finalized.payouts_finalized_at is not null) and a.roper_id = target_roper_id');
  definition:=replace(definition,'remaining winnings for completed ropings','remaining winnings for finalized ropings');
  execute definition;
  select pg_get_functiondef('public.finalize_roping_payouts(uuid,boolean,text)'::regprocedure) into definition;
  definition:=replace(definition,
    'if not exists(select 1 from public.event_roping_payout_plans where event_roping_id=r.id and pool_type=''main'')',
    'if exists(select 1 from public.roping_entries e where e.event_roping_id=r.id and e.competition_status=''active'' and
      (select count(distinct run.round_number) from public.competition_runs run where run.entry_id=e.id and not run.is_excluded
        and run.round_number between 1 and r.main_round_count) < r.main_round_count) then
      raise exception ''Every active entry needs resolved main-round runs before finalizing''; end if;
    if exists(select 1 from public.event_roping_payout_plans plan cross join lateral public.calculate_roping_payouts(plan.id) calculated
      where plan.event_roping_id=r.id and calculated.entry_count>0 and calculated.pool_cents>0 and calculated.place_number is null) then
      raise exception ''Complete every payout schedule before finalizing''; end if;
    if not exists(select 1 from public.event_roping_payout_plans where event_roping_id=r.id and pool_type=''main'')');
  execute definition;
end $$;
