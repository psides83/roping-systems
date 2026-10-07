do $$
declare original text; updated text;
begin
  original := pg_get_functiondef('public.create_event_entry_with_eligibility_override(uuid,uuid,public.entry_source,public.payment_status,text)'::regprocedure);
  updated := replace(original,'entry_origin <> ''office''','entry_origin not in (''office'',''online'')');
  if updated=original then raise exception 'Entry Office source restriction not found'; end if;
  execute updated;
end;
$$;
