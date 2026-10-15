create function public.reorder_producer_sponsors(target_producer_id uuid, ordered_sponsor_ids uuid[], expected_revisions integer[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_administer_organization(target_producer_id) then
    raise exception 'Owner or administrator access is required';
  end if;
  lock table public.producer_sponsors in share row exclusive mode;
  if ordered_sponsor_ids is null or expected_revisions is null
    or cardinality(ordered_sponsor_ids) not between 1 and 10000
    or cardinality(expected_revisions) <> cardinality(ordered_sponsor_ids)
    or array_position(ordered_sponsor_ids, null) is not null
    or array_position(expected_revisions, null) is not null
    or cardinality(ordered_sponsor_ids) <> (select count(distinct id) from unnest(ordered_sponsor_ids) id)
    or cardinality(ordered_sponsor_ids) <> (select count(*) from public.producer_sponsors where producer_id = target_producer_id)
    or exists (select 1 from unnest(ordered_sponsor_ids, expected_revisions) as requested(id, revision)
      where not exists (select 1 from public.producer_sponsors s where s.id = requested.id and s.producer_id = target_producer_id and s.revision = requested.revision))
  then raise exception 'Sponsors changed. Refresh the page before reordering.'; end if;
  update public.producer_sponsors s set sort_order = ordered.position::integer, revision = s.revision + 1
    from unnest(ordered_sponsor_ids) with ordinality as ordered(id, position)
    where s.id = ordered.id and s.producer_id = target_producer_id;
end;
$$;
revoke all on function public.reorder_producer_sponsors(uuid, uuid[], integer[]) from public, anon;
grant execute on function public.reorder_producer_sponsors(uuid, uuid[], integer[]) to authenticated;
