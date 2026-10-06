do $$
declare definition text; marker text := '  target_producer_id := coalesce(';
begin
  definition := pg_get_functiondef('public.write_audit_log()'::regprocedure);
  if position(marker in definition)=0 then raise exception 'Unexpected audit function'; end if;
  definition := replace(definition,marker,
    '  if tg_table_name = ''producers'' and tg_op = ''UPDATE''
    and (old_record - array[''standings_revision'',''updated_at'']) = (new_record - array[''standings_revision'',''updated_at'']) then
    return new;
  end if;
  target_producer_id := coalesce(');
  execute definition;
end;
$$;
