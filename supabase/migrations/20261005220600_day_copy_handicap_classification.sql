-- Handicap ropings combine member classifications and have no single entry class.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.apply_division_classification_settings()'::regprocedure) into definition;
  definition:=replace(definition,'    new.division_id := template_discipline_id;',
    '    new.division_id := template_discipline_id;
    if new.competition_format = ''handicap'' then return new; end if;');
  execute definition;
end;
$$;
