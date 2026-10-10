do $$
declare definition text;
begin
  select pg_get_functiondef('public.save_event_expense(uuid,uuid,integer,uuid,text,bigint,text,boolean)'::regprocedure) into definition;
  definition:=replace(definition,'if target_id is null then','if expected_revision is null or expected_revision<0 or void_expense is null then raise exception ''Provide a valid expense revision and action''; end if; if target_id is null then');
  execute definition;
end $$;
