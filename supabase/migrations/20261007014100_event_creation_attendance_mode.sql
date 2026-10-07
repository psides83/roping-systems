-- Initial event creation uses a separate occurrence-copy workflow.
do $$
declare routine record; definition text;
begin
  for routine in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='create_roping_with_schedule'
  loop
    definition:=pg_get_functiondef(routine.oid);
    if position(E'      main_round_count,\n' in definition)=0 or position(E'      occurrence_round_count,\n' in definition)=0 then
      raise exception 'Unexpected event creation definition';
    end if;
    definition:=replace(definition,E'      main_round_count,\n',E'      main_round_count, attendance_count_mode,\n');
    definition:=replace(definition,E'      occurrence_round_count,\n',E'      occurrence_round_count, template_record.attendance_count_mode,\n');
    execute definition;
  end loop;
end;
$$;
