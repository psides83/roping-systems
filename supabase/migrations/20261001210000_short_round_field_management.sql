create type public.short_round_tie_policy as enum (
  'advance_all',
  'fastest_last_round'
);

alter table public.roping_divisions
  add column short_round_tie_policy public.short_round_tie_policy not null default 'advance_all',
  add column short_round_locked_at timestamptz,
  add column short_round_locked_by uuid references auth.users(id) on delete set null;

create table public.short_round_field_changes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null,
  roping_division_id uuid not null,
  entry_id uuid not null,
  action text not null check (action in ('added', 'removed')),
  reason text not null check (length(trim(reason)) >= 5),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (roping_id, organization_id)
    references public.ropings(id, organization_id) on delete cascade,
  foreign key (roping_division_id, organization_id)
    references public.roping_divisions(id, organization_id) on delete cascade,
  foreign key (entry_id, organization_id)
    references public.entries(id, organization_id) on delete cascade
);

create index short_round_field_changes_division_idx
on public.short_round_field_changes (roping_division_id, created_at desc);

alter table public.short_round_field_changes enable row level security;

create policy "Organization users can read short round changes"
on public.short_round_field_changes for select
using (public.has_organization_access(organization_id));

create policy "Organization managers can insert short round changes"
on public.short_round_field_changes for insert
with check (public.can_manage_organization(organization_id));

create trigger audit_short_round_field_changes
after insert or update or delete on public.short_round_field_changes
for each row execute function public.write_audit_log();

create function public.save_short_round_settings_with_tie_policy(
  target_roping_division_id uuid,
  short_round_is_enabled boolean,
  short_round_brackets jsonb,
  tie_policy public.short_round_tie_policy
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to configure this short round';
  end if;

  perform public.save_short_round_settings(
    target_roping_division_id,
    short_round_is_enabled,
    short_round_brackets
  );

  update public.roping_divisions
  set short_round_tie_policy = tie_policy,
      short_round_locked_at = null,
      short_round_locked_by = null
  where id = target_roping_division_id;
end;
$$;

revoke all on function public.save_short_round_settings_with_tie_policy(
  uuid, boolean, jsonb, public.short_round_tie_policy
) from public;
grant execute on function public.save_short_round_settings_with_tie_policy(
  uuid, boolean, jsonb, public.short_round_tie_policy
) to authenticated;

create function public.create_roping_with_short_round_policy(
  target_organization_id uuid,
  event_title text,
  event_slug text,
  event_venue_name text,
  event_address text,
  event_starts_at_local timestamp without time zone,
  event_ends_at_local timestamp without time zone,
  event_entries_open_at_local timestamp without time zone,
  event_entries_close_at_local timestamp without time zone,
  event_is_public boolean,
  event_class_occurrences jsonb,
  event_short_round_enabled boolean,
  event_short_round_brackets jsonb,
  event_short_round_tie_policy public.short_round_tie_policy,
  event_fee_title text,
  event_fee_amount_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_roping_id uuid;
begin
  new_roping_id := public.create_roping_with_event_operations(
    target_organization_id,
    event_title,
    event_slug,
    event_venue_name,
    event_address,
    event_starts_at_local,
    event_ends_at_local,
    event_entries_open_at_local,
    event_entries_close_at_local,
    event_is_public,
    event_class_occurrences,
    event_short_round_enabled,
    event_short_round_brackets,
    event_fee_title,
    event_fee_amount_cents
  );

  update public.roping_divisions
  set short_round_tie_policy = event_short_round_tie_policy
  where roping_id = new_roping_id
    and short_round_enabled = true;

  return new_roping_id;
end;
$$;

revoke all on function public.create_roping_with_short_round_policy(
  uuid, text, text, text, text, timestamp, timestamp, timestamp, timestamp,
  boolean, jsonb, boolean, jsonb, public.short_round_tie_policy, text, integer
) from public;
grant execute on function public.create_roping_with_short_round_policy(
  uuid, text, text, text, text, timestamp, timestamp, timestamp, timestamp,
  boolean, jsonb, boolean, jsonb, public.short_round_tie_policy, text, integer
) to authenticated;

create or replace function public.seed_short_round(target_roping_division_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  event_status public.roping_status;
  entry_total integer;
  comeback_total integer;
  seeded_total integer;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to build this short round';
  end if;
  if not division_record.short_round_enabled then
    raise exception 'This entry class does not have a short round';
  end if;
  if division_record.short_round_locked_at is not null then
    raise exception 'The short round field is locked';
  end if;

  select status into event_status
  from public.ropings
  where id = division_record.roping_id;

  if event_status <> 'in_progress' then
    raise exception 'Start the event before building the short round';
  end if;
  if exists (
    select 1 from public.runs
    where roping_division_id = target_roping_division_id
      and run_number <= division_record.number_of_runs
      and status in ('pending', 'rerun')
  ) then
    raise exception 'Complete every main-round run before building the short round';
  end if;
  if exists (
    select 1 from public.runs
    where roping_division_id = target_roping_division_id
      and run_number = division_record.number_of_runs + 1
      and status <> 'pending'
  ) then
    raise exception 'Short round results have already been entered';
  end if;

  select count(*)::integer into entry_total
  from public.entries
  where roping_division_id = target_roping_division_id;

  select comeback_count into comeback_total
  from public.roping_short_round_brackets
  where roping_division_id = target_roping_division_id
    and minimum_entries <= entry_total
    and (maximum_entries is null or maximum_entries >= entry_total)
  order by minimum_entries desc
  limit 1;

  if comeback_total is null then
    raise exception 'No short round bracket applies to % entries', entry_total;
  end if;

  delete from public.runs
  where roping_division_id = target_roping_division_id
    and run_number = division_record.number_of_runs + 1;

  with aggregates as (
    select
      run.entry_id,
      sum(greatest(
        run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds,
        0
      )) as aggregate_time,
      max(greatest(
        run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds,
        0
      )) filter (where run.run_number = division_record.number_of_runs) as last_round_time
    from public.runs run
    join public.entries entry on entry.id = run.entry_id
    where run.roping_division_id = target_roping_division_id
      and run.run_number <= division_record.number_of_runs
      and run.status = 'complete'
      and run.is_excluded = false
    group by run.entry_id
    having count(*) = division_record.number_of_runs
  ), ranked as (
    select
      aggregates.*,
      row_number() over (
        order by aggregate_time, last_round_time, entry_id
      )::integer as qualifying_rank
    from aggregates
  ), cutoff as (
    select aggregate_time
    from ranked
    where qualifying_rank = comeback_total
  ), qualifiers as (
    select *
    from ranked
    where qualifying_rank <= comeback_total
      or (
        division_record.short_round_tie_policy = 'advance_all'
        and aggregate_time = (select aggregate_time from cutoff)
      )
  ), ordered_qualifiers as (
    select
      entry_id,
      row_number() over (
        order by aggregate_time desc, last_round_time desc, entry_id
      )::integer as draw_position
    from qualifiers
  )
  insert into public.runs (
    organization_id,
    roping_division_id,
    entry_id,
    run_number,
    draw_position
  )
  select
    division_record.organization_id,
    division_record.id,
    qualifier.entry_id,
    division_record.number_of_runs + 1,
    qualifier.draw_position
  from ordered_qualifiers qualifier;

  get diagnostics seeded_total = row_count;

  update public.roping_divisions
  set short_round_seeded_at = now(),
      short_round_locked_at = null,
      short_round_locked_by = null
  where id = target_roping_division_id;

  return seeded_total;
end;
$$;

create function public.get_short_round_candidates(target_roping_division_id uuid)
returns table (
  entry_id uuid,
  contestant_name text,
  aggregate_time numeric,
  last_round_time numeric,
  is_qualifier boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.has_organization_access(division_record.organization_id) then
    raise exception 'You do not have permission to view this short round';
  end if;

  return query
  select
    run.entry_id,
    concat_ws(' ', person.first_name, person.last_name),
    sum(greatest(
      run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds,
      0
    )),
    max(greatest(
      run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds,
      0
    )) filter (where run.run_number = division_record.number_of_runs),
    exists (
      select 1 from public.runs short_run
      where short_run.roping_division_id = target_roping_division_id
        and short_run.run_number = division_record.number_of_runs + 1
        and short_run.entry_id = run.entry_id
    )
  from public.runs run
  join public.entries entry on entry.id = run.entry_id
  join public.people person on person.id = entry.person_id
  where run.roping_division_id = target_roping_division_id
    and run.run_number <= division_record.number_of_runs
    and run.status = 'complete'
    and run.is_excluded = false
  group by run.entry_id, person.first_name, person.last_name
  having count(*) = division_record.number_of_runs
  order by 3, 4, 1;
end;
$$;

revoke all on function public.get_short_round_candidates(uuid) from public;
grant execute on function public.get_short_round_candidates(uuid) to authenticated;

create function public.manage_short_round_qualifier(
  target_roping_division_id uuid,
  target_entry_id uuid,
  field_action text,
  change_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  short_round_number integer;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to manage this short round';
  end if;
  if field_action not in ('added', 'removed') then
    raise exception 'Choose whether to add or remove the finalist';
  end if;
  if length(trim(coalesce(change_reason, ''))) < 5 then
    raise exception 'Enter a brief reason for changing the finalist field';
  end if;
  if division_record.short_round_seeded_at is null then
    raise exception 'Build the short round before adjusting its field';
  end if;
  if division_record.short_round_locked_at is not null then
    raise exception 'The short round field is locked';
  end if;

  short_round_number := division_record.number_of_runs + 1;

  if exists (
    select 1 from public.runs
    where roping_division_id = target_roping_division_id
      and run_number = short_round_number
      and status <> 'pending'
  ) then
    raise exception 'The finalist field cannot change after the short round begins';
  end if;

  if field_action = 'added' then
    if not exists (
      select 1
      from public.runs run
      where run.roping_division_id = target_roping_division_id
        and run.entry_id = target_entry_id
        and run.run_number <= division_record.number_of_runs
        and run.status = 'complete'
        and run.is_excluded = false
      group by run.entry_id
      having count(*) = division_record.number_of_runs
    ) then
      raise exception 'Only entries with qualified times in every main round can be added';
    end if;
    if exists (
      select 1 from public.runs
      where roping_division_id = target_roping_division_id
        and run_number = short_round_number
        and entry_id = target_entry_id
    ) then
      raise exception 'This entry is already in the short round';
    end if;

    insert into public.runs (
      organization_id, roping_division_id, entry_id, run_number, draw_position
    ) values (
      division_record.organization_id,
      division_record.id,
      target_entry_id,
      short_round_number,
      (
        select coalesce(max(draw_position), 0) + 1
        from public.runs
        where roping_division_id = target_roping_division_id
          and run_number = short_round_number
      )
    );
  else
    delete from public.runs
    where roping_division_id = target_roping_division_id
      and run_number = short_round_number
      and entry_id = target_entry_id
      and status = 'pending';

    if not found then
      raise exception 'This entry is not an editable short round finalist';
    end if;
  end if;

  insert into public.short_round_field_changes (
    organization_id,
    roping_id,
    roping_division_id,
    entry_id,
    action,
    reason,
    changed_by
  ) values (
    division_record.organization_id,
    division_record.roping_id,
    division_record.id,
    target_entry_id,
    field_action,
    trim(change_reason),
    auth.uid()
  );

  set constraints runs_roping_division_id_run_number_draw_position_key deferred;

  with aggregates as (
    select
      short_run.id as run_id,
      sum(greatest(
        main_run.raw_time_seconds + main_run.penalty_seconds - entry.incentive_adjustment_seconds,
        0
      )) as aggregate_time,
      max(greatest(
        main_run.raw_time_seconds + main_run.penalty_seconds - entry.incentive_adjustment_seconds,
        0
      )) filter (where main_run.run_number = division_record.number_of_runs) as last_round_time
    from public.runs short_run
    join public.entries entry on entry.id = short_run.entry_id
    join public.runs main_run
      on main_run.entry_id = short_run.entry_id
     and main_run.roping_division_id = target_roping_division_id
     and main_run.run_number <= division_record.number_of_runs
     and main_run.status = 'complete'
     and main_run.is_excluded = false
    where short_run.roping_division_id = target_roping_division_id
      and short_run.run_number = short_round_number
    group by short_run.id
  ), desired as (
    select
      run_id,
      row_number() over (
        order by aggregate_time desc, last_round_time desc, run_id
      )::integer as draw_position
    from aggregates
  )
  update public.runs run
  set draw_position = desired.draw_position
  from desired
  where run.id = desired.run_id;
end;
$$;

revoke all on function public.manage_short_round_qualifier(
  uuid, uuid, text, text
) from public;
grant execute on function public.manage_short_round_qualifier(
  uuid, uuid, text, text
) to authenticated;

create function public.lock_short_round_field(target_roping_division_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to lock this short round';
  end if;
  if division_record.short_round_seeded_at is null then
    raise exception 'Build the short round before locking its field';
  end if;
  if not exists (
    select 1 from public.runs
    where roping_division_id = target_roping_division_id
      and run_number = division_record.number_of_runs + 1
  ) then
    raise exception 'The short round has no finalists';
  end if;

  update public.roping_divisions
  set short_round_locked_at = coalesce(short_round_locked_at, now()),
      short_round_locked_by = coalesce(short_round_locked_by, auth.uid())
  where id = target_roping_division_id;
end;
$$;

revoke all on function public.lock_short_round_field(uuid) from public;
grant execute on function public.lock_short_round_field(uuid) to authenticated;
