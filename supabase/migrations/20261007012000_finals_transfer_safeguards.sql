-- Positions received through a prior transfer still require a decision on a later move.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.require_finals_position_move_decision()'::regprocedure);
  definition:=replace(definition,'source:=public.finals_qualification_source(season.slug,season.id);',E'if exists(select 1 from public.membership_classification_history h where h.membership_id=new.membership_id and h.division_id=new.division_id and h.finals_position_decision=''transfer'' and h.effective_on<new.effective_on) then has_positions:=true; end if;\n    source:=public.finals_qualification_source(season.slug,season.id);');
  execute definition;
  definition:=pg_get_functiondef('public.finals_qualification_source(text,uuid)'::regprocedure);
  definition:=replace(definition,'''fromClassId'',old.classification_id', '''fromClassId'',case when (select standalone_enabled from public.classifications where id=old.classification_id) then old.classification_id::text else old.division_id::text||'':handicap'' end');
  definition:=replace(definition,'where h.finals_position_decision is not null)', 'where h.finals_position_decision is not null and (c.standalone_enabled or (select standalone_enabled from public.classifications where id=old.classification_id)))');
  execute definition;
end;
$$;
