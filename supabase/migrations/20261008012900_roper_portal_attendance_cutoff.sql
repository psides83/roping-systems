do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.my_roper_standings_context(uuid,uuid)'::regprocedure);
  if position('''cutoffOn'',q.cutoff_on' in definition)=0 then raise exception 'Unexpected roper standings context'; end if;
  execute replace(definition,'''cutoffOn'',q.cutoff_on','''cutoffOn'',q.cutoff_on,''attendanceCutoffOn'',q.attendance_cutoff_on');
end; $$;
