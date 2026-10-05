-- Unstarted ropings can still be removed; their cancelled/reserved funding is audited.
-- Ledger-linked funding remains protected by the transaction foreign key.
alter table public.roping_funding drop constraint roping_funding_event_roping_id_fkey;
alter table public.roping_funding add constraint roping_funding_event_roping_id_fkey
  foreign key(event_roping_id) references public.event_ropings(id) on delete cascade;
do $$
declare definition text;
begin
  select pg_get_functiondef('public.guard_finalized_roping_record()'::regprocedure) into definition;
  definition:=replace(definition,
    'tg_table_name in (''competition_runs'',''roping_entries'',''entry_charges'')',
    'tg_table_name in (''competition_runs'',''roping_entries'',''entry_charges'',''event_fees'')');
  execute definition;
  select pg_get_functiondef('public.finalize_roping_payouts(uuid,boolean,text)'::regprocedure) into definition;
  definition:=replace(definition,'and run.status in (''pending'',''rerun'')','and not run.is_excluded and run.status in (''pending'',''rerun'')');
  execute definition;
end $$;
