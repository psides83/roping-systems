do $migration$
declare
  routine record;
begin
  for routine in
    select procedure.oid, procedure.prosrc
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = 'update_event_details'
  loop
    execute replace(pg_get_functiondef(routine.oid), routine.prosrc,
      replace(routine.prosrc, 'where event_fee_id =', 'where entry_charges.event_fee_id ='));
  end loop;
end;
$migration$;
