begin;
do $$
declare
  p uuid; staff uuid; ids uuid[]; revisions integer[]; saved uuid[];
  rejected boolean; invalid uuid[]; next_revisions integer[];
begin
  select producer_id, user_id into strict p, staff from public.producer_staff where role = 'owner' limit 1;
  perform set_config('request.jwt.claim.sub', staff::text, true);
  insert into public.producer_sponsors(producer_id, name, sort_order, is_active)
    values (p, 'Reorder public fixture', 9999, true), (p, 'Reorder hidden fixture', 10000, false);
  select array_agg(id order by sort_order desc, id), array_agg(revision order by sort_order desc, id)
    into ids, revisions from public.producer_sponsors where producer_id = p;
  perform public.reorder_producer_sponsors(p, ids, revisions);
  select array_agg(id order by sort_order), array_agg(revision order by sort_order)
    into saved, next_revisions from public.producer_sponsors where producer_id = p;
  if saved is distinct from ids then raise exception 'Sponsor order was not saved'; end if;
  if exists (select 1 from unnest(revisions, next_revisions) as r(old_revision, new_revision)
    where new_revision <> old_revision + 1) then raise exception 'Sponsor revisions not advanced'; end if;
  rejected := false;
  begin perform public.reorder_producer_sponsors(p, ids, revisions);
  exception when others then rejected := true; end;
  if not rejected then raise exception 'Stale sponsor revision accepted'; end if;
  for invalid in select v from (values (ids || ids[1]), (ids[2:cardinality(ids)]),
    (array_replace(ids, ids[1], gen_random_uuid())), (array_replace(ids, ids[1], null::uuid))) cases(v) loop
    rejected := false;
    begin perform public.reorder_producer_sponsors(p, invalid, next_revisions);
    exception when others then rejected := true; end;
    if not rejected then raise exception 'Invalid sponsor list accepted'; end if;
  end loop;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  rejected := false;
  begin perform public.reorder_producer_sponsors(p, ids, next_revisions);
  exception when others then rejected := true; end;
  if not rejected then raise exception 'Unauthorized sponsor reorder accepted'; end if;
  select array_agg(id order by sort_order) into saved from public.producer_sponsors where producer_id = p;
  if saved is distinct from ids then raise exception 'Rejected reorder changed sponsors'; end if;
end $$;
rollback;
