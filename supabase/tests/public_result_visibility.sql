-- Run against a test project with at least one recorded, active entry.
begin;

select set_config('test.public_event_id', (
  select event.id::text from public.events event
  join public.event_ropings roping on roping.event_id = event.id
  join public.roping_entries entry on entry.event_roping_id = roping.id
  join public.competition_runs run on run.entry_id = entry.id
  where entry.competition_status = 'active' and run.status = 'complete'
  limit 1
), true);

select set_config('test.public_event_slug', (
  select slug from public.events
  where id = current_setting('test.public_event_id')::uuid
), true);

update public.events
set publication_state = 'published', is_public = false
where id = current_setting('test.public_event_id')::uuid;

set local role anon;
do $$
begin
  if not exists (
    select 1 from public.public_aggregate_results
    where event_slug = (
      select slug from public.public_event_schedule
      where id = current_setting('test.public_event_id')::uuid
    )
  ) then
    raise exception 'Published recorded results must be visible without a login';
  end if;
end;
$$;

reset role;
update public.events set publication_state = 'unpublished', is_public = true
where id = current_setting('test.public_event_id')::uuid;

set local role anon;
do $$
begin
  if exists (
    select 1 from public.public_event_entry_options
    where event_id = current_setting('test.public_event_id')::uuid
  ) or exists (
    select 1 from public.public_competition_formats
    where event_id = current_setting('test.public_event_id')::uuid
  ) or exists (
    select 1 from public.public_aggregate_results
    where event_slug = current_setting('test.public_event_slug')
  ) or exists (
    select 1 from public.public_event_live_results
    where event_slug = current_setting('test.public_event_slug')
  ) then
    raise exception 'Unpublished event data must stay hidden despite the old flag';
  end if;
end;
$$;

reset role;
update public.events set publication_state = 'draft'
where id = current_setting('test.public_event_id')::uuid;

set local role anon;
do $$
begin
  if exists (
    select 1 from public.public_event_schedule
    where id = current_setting('test.public_event_id')::uuid
  ) or exists (
    select 1 from public.public_aggregate_results
    where event_slug = current_setting('test.public_event_slug')
  ) then
    raise exception 'Draft events must not appear on the public schedule';
  end if;
end;
$$;
rollback;
select 'Published visibility and hidden draft/unpublished checks passed; changes rolled back' as result;
