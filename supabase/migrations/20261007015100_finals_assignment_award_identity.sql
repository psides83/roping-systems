-- Require the canonical source identity so aliases cannot duplicate a position.
do $$
declare
  definition text;
  original text;
begin
  select pg_get_functiondef('public.assign_finals_position(uuid,uuid,uuid,text,integer,text,uuid,bigint,text)'::regprocedure) into original;
  definition := replace(original,
    'source_id:=split_part(target_award_key,'':'',2)::uuid;' || chr(10) || '    select positions',
    'source_id:=split_part(target_award_key,'':'',2)::uuid;' || chr(10) ||
    '    if target_award_key <> ''manual:'' || source_id::text then raise exception ''Invalid earned position identity''; end if;' || chr(10) || '    select positions');
  definition := replace(definition,
    'source_entry:=split_part(target_award_key,'':'',3)::uuid;',
    'source_entry:=split_part(target_award_key,'':'',3)::uuid;' || chr(10) ||
    '    if target_award_key <> ''finish:'' || source_id::text || '':'' || source_entry::text then raise exception ''Invalid earned position identity''; end if;');
  if definition = original or position('Invalid earned position identity' in definition) = 0 then
    raise exception 'Could not update earned position identity validation';
  end if;
  execute definition;
end;
$$;
