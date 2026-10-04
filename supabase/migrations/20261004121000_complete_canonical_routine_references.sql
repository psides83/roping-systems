-- Resolve the context-dependent template fields and a fee argument whose
-- historical name now matches the canonical entry-charge column.
do $migration$
declare
  routine record;
  body text;
begin
  for routine in
    select procedure.oid, procedure.proname, procedure.prosrc
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'update_event_details', 'create_roping_with_incentives',
        'create_roping_with_class_settings', 'transfer_event_entry'
      )
  loop
    body := routine.prosrc;
    if routine.proname = 'update_event_details' then
      body := replace(body, '= event_fee_id', '= update_event_details.event_fee_id');
    elsif routine.proname = 'transfer_event_entry' then
      body := replace(body, 'charge_record.source_template_id', 'charge_record.roping_template_fee_id');
    else
      body := regexp_replace(body, '\msource_template_id\M', 'roping_template_id', 'g');
    end if;
    if body is distinct from routine.prosrc then
      execute replace(pg_get_functiondef(routine.oid), routine.prosrc, body);
    end if;
  end loop;
end;
$migration$;
