-- Save a complete producer-specific order in one transaction.
create function public.reorder_roping_templates(target_producer_id uuid, ordered_template_ids uuid[])
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_organization(target_producer_id) then
    raise exception 'Manager access is required';
  end if;
  -- Serialize reorders; the table lock also prevents a concurrent create/delete
  -- from changing membership between validation and update.
  lock table public.roping_templates in share row exclusive mode;
  if ordered_template_ids is null
    or cardinality(ordered_template_ids) = 0
    or array_position(ordered_template_ids, null) is not null
    or cardinality(ordered_template_ids) <> (select count(distinct id) from unnest(ordered_template_ids) id)
    or exists (select 1 from unnest(ordered_template_ids) as requested(id) where not exists (
      select 1 from public.roping_templates t where t.id = requested.id and t.producer_id = target_producer_id
    ))
    or cardinality(ordered_template_ids) <> (select count(*) from public.roping_templates where producer_id = target_producer_id)
  then
    raise exception 'Templates changed. Refresh the page before reordering.';
  end if;
  update public.roping_templates t set sort_order = ordered.position::integer - 1
  from unnest(ordered_template_ids) with ordinality as ordered(id, position)
  where t.id = ordered.id and t.producer_id = target_producer_id;
end;
$$;
revoke all on function public.reorder_roping_templates(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_roping_templates(uuid, uuid[]) to authenticated;
