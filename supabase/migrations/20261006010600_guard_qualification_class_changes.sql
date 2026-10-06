do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.standings_qualification_failure(uuid,uuid)'::regprocedure);
  if position('if check_record.event_roping_id is null then return null; end if;' in definition)=0 then
    raise exception 'Unexpected qualification failure function';
  end if;
  definition := replace(definition,'if check_record.event_roping_id is null then return null; end if;',
    'if check_record.event_roping_id is null then return null; end if;
  if not exists(select 1 from public.event_ropings r where r.id=target_roping_id
    and check_record.class_key=(case when r.competition_format in (''handicap'',''four_d'')
      then r.division_id::text||'':''||r.competition_format else r.classification_id::text end)) then
    return ''This roping classification changed. Update its qualification setup before accepting entries'';
  end if;');
  execute definition;
end;
$$;
