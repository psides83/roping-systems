alter table public.ropings
  add column arena_count integer not null default 1
    check (arena_count between 1 and 20);

with event_arena_counts as (
  select
    roping_id,
    greatest(
      1,
      coalesce(
        max(
          case
            when arena_name ~ '^Arena [1-9][0-9]*$'
              then substring(arena_name from '[0-9]+$')::integer
            else null
          end
        ),
        1
      )
    ) as arena_count
  from public.roping_divisions
  group by roping_id
)
update public.ropings roping
set arena_count = event_arena_counts.arena_count
from event_arena_counts
where event_arena_counts.roping_id = roping.id;

create function public.validate_event_arena_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_arena_count integer;
  selected_arena_number integer;
begin
  select arena_count into configured_arena_count
  from public.ropings
  where id = new.roping_id;

  if new.arena_name is null then
    return new;
  end if;

  if new.arena_name = 'First Available' then
    return new;
  end if;

  if new.arena_name !~ '^Arena [1-9][0-9]*$' then
    raise exception 'Choose an arena configured for this event';
  end if;

  selected_arena_number := substring(new.arena_name from '[0-9]+$')::integer;
  if selected_arena_number > configured_arena_count then
    raise exception 'That arena is not configured for this event';
  end if;

  return new;
end;
$$;

create trigger roping_divisions_validate_event_arena
before update of roping_id, arena_name on public.roping_divisions
for each row execute function public.validate_event_arena_assignment();

create function public.set_event_arena_count(
  target_roping_id uuid,
  new_arena_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.ropings%rowtype;
begin
  select * into event_record
  from public.ropings
  where id = target_roping_id
  for update;

  if event_record.id is null
    or not public.can_manage_organization(event_record.organization_id) then
    raise exception 'You do not have permission to edit this event';
  end if;
  if event_record.status in ('in_progress', 'completed', 'cancelled') then
    raise exception 'Arena setup cannot change after the event has started';
  end if;
  if new_arena_count not between 1 and 20 then
    raise exception 'Arena count must be between 1 and 20';
  end if;
  if exists (
    select 1
    from public.roping_divisions division
    where division.roping_id = event_record.id
      and division.arena_name ~ '^Arena [1-9][0-9]*$'
      and substring(division.arena_name from '[0-9]+$')::integer > new_arena_count
  ) then
    raise exception 'Move ropings out of higher-numbered arenas before reducing the arena count';
  end if;

  update public.ropings
  set arena_count = new_arena_count
  where id = event_record.id;
end;
$$;

revoke all on function public.set_event_arena_count(uuid, integer) from public;
grant execute on function public.set_event_arena_count(uuid, integer) to authenticated;
