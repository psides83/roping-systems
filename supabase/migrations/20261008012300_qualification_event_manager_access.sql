do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.save_qualification_assignment(uuid,uuid,text,uuid)'::regprocedure);
  definition:=replace(definition,'not public.can_manage_organization(e.producer_id)','not public.can_manage_event(e.id)');
  execute definition;
end; $$;
