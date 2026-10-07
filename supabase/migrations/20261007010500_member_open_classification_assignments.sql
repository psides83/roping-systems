-- Keep Open membership assignments consistent with importer choices.
do $$
declare routine record; definition text;
begin
  for routine in
    select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('update_organization_member','create_organization_member_v2')
  loop
    definition:=pg_get_functiondef(routine.oid);
    if position('eligibility_type = ''skill''' in definition)=0 then
      raise exception 'Expected member classification eligibility validation was not found';
    end if;
    execute replace(definition,'eligibility_type = ''skill''','eligibility_type in (''skill'',''open'')');
  end loop;
end;
$$;
