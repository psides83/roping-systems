do $$
declare original text;
begin
  original := pg_get_functiondef('public.correct_event_roper_contact(uuid,uuid,text,text,text)'::regprocedure);
  execute replace(original,'''UPDATE''','''update''');
end;
$$;
