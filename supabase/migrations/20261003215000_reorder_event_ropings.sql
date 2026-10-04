create function public.reorder_event_ropings(
  target_event_id uuid,
  ordered_event_roping_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.events%rowtype;
  event_roping_count integer;
  supplied_count integer;
  distinct_supplied_count integer;
begin
  select * into event_record
  from public.events
  where id = target_event_id
  for update;

  if event_record.id is null
    or not public.can_manage_organization(event_record.producer_id) then
    raise exception 'You do not have permission to reorder this event';
  end if;
  if event_record.status in ('in_progress', 'completed', 'cancelled') then
    raise exception 'The roping order cannot change after the event has started';
  end if;

  select count(*)::integer into event_roping_count
  from public.event_ropings
  where event_id = target_event_id;

  select count(*)::integer, count(distinct supplied.id)::integer
  into supplied_count, distinct_supplied_count
  from unnest(ordered_event_roping_ids) supplied(id);

  if supplied_count <> event_roping_count
    or distinct_supplied_count <> event_roping_count
    or exists (
      select 1
      from unnest(ordered_event_roping_ids) supplied(id)
      left join public.event_ropings event_roping
        on event_roping.id = supplied.id
        and event_roping.event_id = target_event_id
      where event_roping.id is null
    ) then
    raise exception 'The submitted roping order is incomplete or invalid';
  end if;

  if exists (
    select 1
    from unnest(ordered_event_roping_ids) with ordinality ordered(id, position)
    join public.event_ropings event_roping on event_roping.id = ordered.id
    where event_roping.schedule_type = 'follows_previous'
      and not exists (
        select 1
        from unnest(ordered_event_roping_ids) with ordinality earlier(id, position)
        join public.event_ropings earlier_roping on earlier_roping.id = earlier.id
        where earlier.position < ordered.position
          and earlier_roping.scheduled_date = event_roping.scheduled_date
          and earlier_roping.arena_name is not distinct from event_roping.arena_name
      )
  ) then
    raise exception 'A follows roping must have an earlier roping in the same arena';
  end if;

  update public.event_ropings event_roping
  set sort_order = ordered.position
  from unnest(ordered_event_roping_ids) with ordinality ordered(id, position)
  where event_roping.id = ordered.id
    and event_roping.event_id = target_event_id;

  return event_roping_count;
end;
$$;

revoke all on function public.reorder_event_ropings(uuid, uuid[]) from public;
grant execute on function public.reorder_event_ropings(uuid, uuid[]) to authenticated;
