begin;
do $$
declare
  p uuid; staff uuid; ids uuid[]; saved uuid[]; invalid uuid[]; rejected boolean;
begin
  select producer_id, user_id into strict p, staff from public.producer_staff where role = 'owner' limit 1;
  perform set_config('request.jwt.claim.sub', staff::text, true);
  select array_agg(id order by sort_order desc, created_at desc, id desc) into ids
    from public.roping_templates where producer_id = p;
  if cardinality(ids) < 2 then raise exception 'Two template fixtures required'; end if;
  perform public.reorder_roping_templates(p, ids);
  select array_agg(id order by sort_order) into saved from public.roping_templates where producer_id = p;
  if saved is distinct from ids then raise exception 'Order was not saved'; end if;
  for invalid in select v from (values (ids || ids[1]), (array_replace(ids, ids[1], gen_random_uuid())), (array_replace(ids, ids[1], null::uuid))) cases(v) loop
    rejected := false;
    begin perform public.reorder_roping_templates(p, invalid);
    exception when others then rejected := true; end;
    if not rejected then raise exception 'Invalid template list accepted'; end if;
  end loop;
  rejected := false;
  begin perform public.reorder_roping_templates(p, ids[2:cardinality(ids)]);
  exception when others then rejected := true; end;
  if not rejected then raise exception 'Incomplete template list accepted'; end if;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  rejected := false;
  begin perform public.reorder_roping_templates(p, ids);
  exception when others then rejected := true; end;
  if not rejected then raise exception 'Unauthorized reorder accepted'; end if;
  select array_agg(id order by sort_order) into saved from public.roping_templates where producer_id = p;
  if saved is distinct from ids then raise exception 'Rejected request changed the order'; end if;
end $$;
rollback;
