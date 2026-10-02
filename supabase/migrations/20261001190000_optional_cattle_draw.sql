alter table public.roping_divisions
  add column cattle_draw_enabled boolean not null default false;

create table public.event_cattle (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null,
  tag_number text not null check (length(trim(tag_number)) between 1 and 40),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (roping_id, tag_number),
  foreign key (roping_id, organization_id)
    references public.ropings(id, organization_id) on delete cascade
);

create index event_cattle_roping_active_idx
on public.event_cattle (roping_id, is_active, tag_number);

alter table public.runs
  add column cattle_id uuid,
  add constraint runs_cattle_organization_fkey
    foreign key (cattle_id, organization_id)
    references public.event_cattle(id, organization_id) on delete set null;

create index runs_cattle_idx on public.runs (cattle_id) where cattle_id is not null;

alter table public.event_cattle enable row level security;

create policy "Organization users can read event cattle"
on public.event_cattle for select
using (public.has_organization_access(organization_id));

create policy "Organization managers can add event cattle"
on public.event_cattle for insert
with check (public.can_manage_organization(organization_id));

create policy "Organization managers can update event cattle"
on public.event_cattle for update
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create policy "Organization managers can delete event cattle"
on public.event_cattle for delete
using (public.can_manage_organization(organization_id));

create trigger set_event_cattle_updated_at
before update on public.event_cattle
for each row execute function public.set_updated_at();

create trigger audit_event_cattle
after insert or update or delete on public.event_cattle
for each row execute function public.write_audit_log();

create function public.set_division_cattle_draw_enabled(
  target_roping_division_id uuid,
  cattle_draw_is_enabled boolean
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
    raise exception 'You do not have permission to update this class';
  end if;

  update public.roping_divisions
  set cattle_draw_enabled = cattle_draw_is_enabled
  where id = target_roping_division_id;

  if not cattle_draw_is_enabled then
    update public.runs
    set cattle_id = null
    where roping_division_id = target_roping_division_id
      and status in ('pending', 'rerun');
  end if;
end;
$$;

revoke all on function public.set_division_cattle_draw_enabled(uuid, boolean)
from public;
grant execute on function public.set_division_cattle_draw_enabled(uuid, boolean)
to authenticated;

create function public.save_event_cattle(
  target_roping_id uuid,
  cattle_tags text[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.ropings%rowtype;
  normalized_tags text[];
  saved_count integer;
begin
  select * into event_record
  from public.ropings
  where id = target_roping_id;

  if event_record.id is null
    or not public.can_manage_organization(event_record.organization_id) then
    raise exception 'You do not have permission to manage cattle for this event';
  end if;

  select coalesce(array_agg(tag order by tag), '{}'::text[])
    into normalized_tags
  from (
    select distinct trim(value) as tag
    from unnest(coalesce(cattle_tags, '{}'::text[])) as value
    where nullif(trim(value), '') is not null
      and length(trim(value)) <= 40
  ) normalized;

  update public.event_cattle
  set is_active = tag_number = any(normalized_tags)
  where roping_id = target_roping_id;

  insert into public.event_cattle (
    organization_id, roping_id, tag_number, is_active
  )
  select event_record.organization_id, target_roping_id, tag, true
  from unnest(normalized_tags) as tag
  on conflict (roping_id, tag_number)
  do update set is_active = true;

  select count(*) into saved_count
  from public.event_cattle
  where roping_id = target_roping_id and is_active = true;

  return saved_count;
end;
$$;

revoke all on function public.save_event_cattle(uuid, text[]) from public;
grant execute on function public.save_event_cattle(uuid, text[]) to authenticated;

create function public.draw_round_cattle(
  target_roping_division_id uuid,
  target_run_number integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  selected_cattle_id uuid;
  assigned_count integer := 0;
  pending_run record;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null
    or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to draw cattle for this class';
  end if;
  if not division_record.cattle_draw_enabled then
    raise exception 'Enable cattle drawing for this class first';
  end if;
  if target_run_number < 1 then
    raise exception 'Choose a valid round';
  end if;
  if not exists (
    select 1 from public.event_cattle
    where roping_id = division_record.roping_id and is_active = true
  ) then
    raise exception 'Add at least one active animal before drawing cattle';
  end if;
  if exists (
    select 1 from public.runs
    where roping_division_id = target_roping_division_id
      and run_number = target_run_number
      and status not in ('pending', 'rerun')
  ) then
    raise exception 'Cattle cannot be redrawn after results have been recorded';
  end if;

  update public.runs
  set cattle_id = null
  where roping_division_id = target_roping_division_id
    and run_number = target_run_number;

  for pending_run in
    select id
    from public.runs
    where roping_division_id = target_roping_division_id
      and run_number = target_run_number
    order by draw_position nulls last, created_at
  loop
    select cattle.id into selected_cattle_id
    from public.event_cattle cattle
    left join public.runs prior_run
      on prior_run.cattle_id = cattle.id
     and prior_run.roping_division_id = target_roping_division_id
    where cattle.roping_id = division_record.roping_id
      and cattle.is_active = true
    group by cattle.id
    order by count(prior_run.id), random()
    limit 1;

    update public.runs
    set cattle_id = selected_cattle_id
    where id = pending_run.id;
    assigned_count := assigned_count + 1;
  end loop;

  return assigned_count;
end;
$$;

revoke all on function public.draw_round_cattle(uuid, integer) from public;
grant execute on function public.draw_round_cattle(uuid, integer) to authenticated;

create or replace function public.create_roping_with_competition_formats(
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
  event_fee_title text,
  event_fee_amount_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  occurrence jsonb;
  incentive_rule jsonb;
  transformed_occurrences jsonb := '[]'::jsonb;
  transformed_occurrence jsonb;
  transformed_rules jsonb;
  new_roping_id uuid;
  new_division_id uuid;
  occurrence_position integer := 0;
  target_classification_id uuid;
  target_adjustment numeric(8, 3);
begin
  if jsonb_typeof(event_class_occurrences) <> 'array' then
    raise exception 'Add at least one scheduled class roping';
  end if;

  for occurrence in select * from jsonb_array_elements(event_class_occurrences)
  loop
    transformed_occurrence := occurrence;
    transformed_rules := '[]'::jsonb;

    if coalesce((occurrence ->> 'incentiveEnabled')::boolean, false) then
      for incentive_rule in select * from jsonb_array_elements(occurrence -> 'incentiveRules')
      loop
        target_adjustment := round((incentive_rule ->> 'adjustmentSeconds')::numeric, 3);
        if target_adjustment = 0 or abs(target_adjustment) > 60 then
          raise exception 'Handicap adjustments must be non-zero and no more than 60 seconds';
        end if;
        transformed_rules := transformed_rules || jsonb_build_array(
          jsonb_set(incentive_rule, '{adjustmentSeconds}', to_jsonb(abs(target_adjustment)))
        );
      end loop;
      transformed_occurrence := jsonb_set(transformed_occurrence, '{incentiveRules}', transformed_rules);
    end if;

    transformed_occurrences := transformed_occurrences || jsonb_build_array(transformed_occurrence);
  end loop;

  new_roping_id := public.create_roping_with_schedule(
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
    transformed_occurrences,
    event_short_round_enabled,
    event_short_round_brackets,
    event_fee_title,
    event_fee_amount_cents
  );

  for occurrence in select * from jsonb_array_elements(event_class_occurrences)
  loop
    occurrence_position := occurrence_position + 1;
    select id into new_division_id
    from public.roping_divisions
    where roping_id = new_roping_id and sort_order = occurrence_position;

    update public.roping_divisions
    set cattle_draw_enabled = coalesce(
      (occurrence ->> 'cattleDrawEnabled')::boolean,
      false
    )
    where id = new_division_id;

    if coalesce((occurrence ->> 'incentiveEnabled')::boolean, false) then
      for incentive_rule in select * from jsonb_array_elements(occurrence -> 'incentiveRules')
      loop
        target_classification_id := (incentive_rule ->> 'classificationId')::uuid;
        target_adjustment := round((incentive_rule ->> 'adjustmentSeconds')::numeric, 3);
        update public.roping_incentive_rules
        set adjustment_seconds = target_adjustment
        where roping_division_id = new_division_id
          and classification_id = target_classification_id;
      end loop;
    end if;
  end loop;

  return new_roping_id;
end;
$$;
