-- Bonus-only standings rows use a sentinel rank larger than a PostgreSQL integer.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.standings_qualification_failure(uuid,uuid)'::regprocedure);
  definition:=replace(definition,'where id=public.effective_qualification_rule_set(target_roping_id);','where id=public.effective_qualification_rule_set(target_roping_id) for share;');
  definition:=replace(definition,'(item->>''rank'')::integer,2147483647','(item->>''rank'')::bigint,9223372036854775807');
  execute definition;
  definition:=pg_get_functiondef('public.save_qualification_assignment(uuid,uuid,text,uuid)'::regprocedure);
  definition:=replace(definition,
    'join public.event_ropings r on r.id=x.event_roping_id where r.event_id=e.id and r.qualification_override=',
    'join public.event_ropings scoped on scoped.id=x.event_roping_id where scoped.event_id=e.id and scoped.qualification_override=');
  definition:=replace(definition,
    'using public.event_ropings r where c.event_roping_id=r.id and r.event_id=e.id and r.qualification_override=',
    'using public.event_ropings scoped where c.event_roping_id=scoped.id and scoped.event_id=e.id and scoped.qualification_override=');
  execute definition;
end; $$;
