create or replace function public.save_roping_schedule(
  target_roping_division_id uuid,
  target_scheduled_date date,
  target_schedule_type public.class_schedule_type,
  target_starts_at_local timestamp without time zone,
  target_schedule_note text,
  target_arena_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  roping public.event_ropings%rowtype;
  event public.events%rowtype;
begin
  select * into roping from public.event_ropings
  where id = target_roping_division_id for update;
  if roping.id is null or not public.can_manage_organization(roping.producer_id) then
    raise exception 'You do not have permission to update this schedule';
  end if;
  select * into event from public.events where id = roping.event_id for update;
  if event.status in ('in_progress', 'completed', 'cancelled') then
    raise exception 'Use the live schedule controls after the event has started';
  end if;
  if target_arena_name is null or not (
    target_arena_name = 'First Available' or target_arena_name in (
      select 'Arena ' || number from generate_series(1, event.arena_count) number
    )
  ) then
    raise exception 'Choose an arena configured for this event';
  end if;
  if target_schedule_type = 'follows_previous' and not exists (
    select 1 from public.event_ropings previous
    where previous.event_id = roping.event_id
      and previous.scheduled_date = target_scheduled_date
      and previous.arena_name = target_arena_name
      and previous.sort_order < roping.sort_order
  ) then
    raise exception 'A follows roping needs an earlier roping in the selected arena on the same date';
  end if;
  update public.event_ropings set arena_name = target_arena_name where id = roping.id;
  perform public.save_class_schedule(target_roping_division_id, target_scheduled_date,
    target_schedule_type, target_starts_at_local, target_schedule_note);
end;
$$;

revoke all on function public.save_roping_schedule(uuid,date,public.class_schedule_type,timestamp,text,text) from public;
grant execute on function public.save_roping_schedule(uuid,date,public.class_schedule_type,timestamp,text,text) to authenticated;
