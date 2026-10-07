-- A closed parent event must not leave its entries in the upcoming list.
do $$
declare definition text; original text;
begin
  select pg_get_functiondef('public.my_roper_portal()'::regprocedure) into original;
  definition := replace(original, '''status'', r.event_day_status',
    '''status'', case when v.status in (''completed'',''cancelled'') then v.status::text else r.event_day_status::text end');
  if definition = original then raise exception 'Portal event status update did not match'; end if;
  execute definition;
end;
$$;
