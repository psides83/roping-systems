create table public.event_roping_removals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null,
  removed_roping_division_id uuid not null,
  roping_name text not null,
  entry_count integer not null default 0,
  reason text not null check (length(trim(reason)) >= 5),
  removed_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz not null default now(),
  foreign key (roping_id, organization_id) references public.ropings(id, organization_id) on delete cascade
);

alter table public.event_roping_removals enable row level security;
create policy "Producer users can read removed event ropings"
on public.event_roping_removals for select
using (public.has_organization_access(organization_id));
create trigger audit_event_roping_removals
after insert or update or delete on public.event_roping_removals
for each row execute function public.write_audit_log();

create function public.add_roping_to_event(
  target_roping_id uuid,
  target_template_id uuid,
  target_classification_id uuid,
  target_scheduled_date date,
  target_schedule_type public.class_schedule_type,
  target_starts_at_local timestamp without time zone,
  target_schedule_note text,
  target_arena_name text,
  target_round_count integer,
  target_cattle_draw_enabled boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.ropings%rowtype;
  template_record public.division_templates%rowtype;
  classification_record public.classifications%rowtype;
  fee_record public.fee_templates%rowtype;
  handicap_rule jsonb;
  new_division_id uuid;
  new_fee_id uuid;
  organization_timezone text;
  next_sort_order integer;
  rule_classification_id uuid;
  rule_adjustment numeric(8, 3);
begin
  select * into event_record from public.ropings where id = target_roping_id for update;
  if event_record.id is null or not public.can_manage_organization(event_record.organization_id) then
    raise exception 'You do not have permission to edit this event';
  end if;
  if event_record.status in ('completed', 'cancelled') then
    raise exception 'Ropings cannot be added to a completed or cancelled event';
  end if;
  if target_round_count not between 1 and 20 then raise exception 'Main rounds must be between 1 and 20'; end if;
  if target_schedule_type in ('fixed', 'tentative') and target_starts_at_local is null then
    raise exception 'Set and tentative schedules require a start time';
  end if;
  if target_schedule_type = 'follows_previous' and not exists (
    select 1 from public.roping_divisions
    where roping_id = target_roping_id and scheduled_date = target_scheduled_date
  ) then raise exception 'A follows-previous roping needs an earlier roping on the same date'; end if;

  select * into template_record from public.division_templates
  where id = target_template_id and organization_id = event_record.organization_id and is_active = true;
  if template_record.id is null then raise exception 'That roping template is unavailable'; end if;

  if template_record.competition_format = 'handicap' then
    select * into classification_record from public.classifications
    where organization_id = event_record.organization_id
      and discipline_id = template_record.discipline_id and is_active = true
    order by rank desc, created_at limit 1;
  else
    select * into classification_record from public.classifications
    where id = target_classification_id and organization_id = event_record.organization_id
      and discipline_id = template_record.discipline_id and is_active = true;
  end if;
  if classification_record.id is null then raise exception 'Choose an active classification for this roping'; end if;

  select timezone into organization_timezone from public.organizations where id = event_record.organization_id;
  select coalesce(max(sort_order), 0) + 1 into next_sort_order
  from public.roping_divisions where roping_id = target_roping_id;

  insert into public.roping_divisions (
    organization_id, roping_id, source_template_id, discipline_id, classification_id,
    name, description, number_of_runs, maximum_entries_per_person, allow_guests,
    eligibility_rules, scoring_rules, sort_order, starts_at, scheduled_date,
    schedule_type, schedule_note, incentive_enabled, arena_name, cattle_draw_enabled
  ) values (
    event_record.organization_id, event_record.id, template_record.id,
    template_record.discipline_id, classification_record.id,
    case when template_record.competition_format = 'handicap' then 'Handicap' else classification_record.name end,
    template_record.description, target_round_count, template_record.maximum_entries_per_person,
    template_record.allow_guests, template_record.eligibility_rules, template_record.scoring_rules,
    next_sort_order,
    case when target_schedule_type = 'follows_previous' then null else target_starts_at_local at time zone organization_timezone end,
    target_scheduled_date, target_schedule_type, nullif(trim(target_schedule_note), ''),
    template_record.competition_format = 'handicap', nullif(trim(target_arena_name), ''),
    target_cattle_draw_enabled
  ) returning id into new_division_id;

  if template_record.competition_format = 'handicap' then
    update public.roping_divisions set classification_id = null where id = new_division_id;
    for handicap_rule in select * from jsonb_array_elements(template_record.handicap_rules) loop
      rule_classification_id := (handicap_rule ->> 'classificationId')::uuid;
      rule_adjustment := round((handicap_rule ->> 'adjustmentSeconds')::numeric, 3);
      insert into public.roping_incentive_rules (
        organization_id, roping_id, roping_division_id, classification_id, adjustment_seconds
      ) values (
        event_record.organization_id, event_record.id, new_division_id,
        rule_classification_id, rule_adjustment
      );
    end loop;
  end if;

  if template_record.payout_schedule_id is not null then
    perform public.copy_payout_schedule_to_event(
      event_record.organization_id, event_record.id, new_division_id, null,
      template_record.payout_schedule_id,
      case when template_record.competition_format = 'handicap' then 'Handicap' else classification_record.name end,
      'main'
    );
  end if;

  for fee_record in select * from public.fee_templates
    where division_template_id = template_record.id order by sort_order, created_at
  loop
    insert into public.roping_fees (
      organization_id, roping_id, roping_division_id, source_template_id, title,
      amount_cents, scope, included_in_entry_price, contributes_to_payout,
      is_required, sort_order, kind
    ) values (
      event_record.organization_id, event_record.id, new_division_id, fee_record.id,
      fee_record.title, fee_record.amount_cents, fee_record.scope,
      fee_record.included_in_entry_price, fee_record.contributes_to_payout,
      fee_record.is_required, fee_record.sort_order, fee_record.kind
    ) returning id into new_fee_id;
    if fee_record.kind in ('side_pot', 'insurance') and fee_record.payout_schedule_id is not null then
      perform public.copy_payout_schedule_to_event(
        event_record.organization_id, event_record.id, new_division_id, new_fee_id,
        fee_record.payout_schedule_id, fee_record.title, 'side_pot'
      );
    end if;
  end loop;

  update public.ropings set incentive_enabled = exists (
    select 1 from public.roping_divisions where roping_id = event_record.id and incentive_enabled
  ) where id = event_record.id;
  return new_division_id;
end;
$$;

revoke all on function public.add_roping_to_event(uuid, uuid, uuid, date, public.class_schedule_type, timestamp, text, text, integer, boolean) from public;
grant execute on function public.add_roping_to_event(uuid, uuid, uuid, date, public.class_schedule_type, timestamp, text, text, integer, boolean) to authenticated;

create function public.remove_roping_from_event(target_roping_division_id uuid, removal_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  removed_entries integer;
begin
  select * into division_record from public.roping_divisions
  where id = target_roping_division_id for update;
  if division_record.id is null or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to remove this roping';
  end if;
  if length(trim(coalesce(removal_reason, ''))) < 5 then raise exception 'Enter a brief removal reason'; end if;
  if division_record.event_day_status in ('in_progress', 'completed')
    or exists (select 1 from public.runs where roping_division_id = division_record.id and recorded_at is not null) then
    raise exception 'This roping has started and can no longer be removed';
  end if;
  if (select count(*) from public.roping_divisions where roping_id = division_record.roping_id) <= 1 then
    raise exception 'An event must keep at least one roping';
  end if;
  select count(*)::integer into removed_entries from public.entries
  where roping_division_id = division_record.id;
  insert into public.event_roping_removals (
    organization_id, roping_id, removed_roping_division_id, roping_name,
    entry_count, reason, removed_by
  ) values (
    division_record.organization_id, division_record.roping_id, division_record.id,
    division_record.name, removed_entries, trim(removal_reason), auth.uid()
  );
  delete from public.roping_divisions where id = division_record.id;
  with ordered as (
    select id, row_number() over (order by scheduled_date, sort_order, created_at) as next_order
    from public.roping_divisions where roping_id = division_record.roping_id
  ) update public.roping_divisions division set sort_order = ordered.next_order
    from ordered where division.id = ordered.id;
  update public.ropings set incentive_enabled = exists (
    select 1 from public.roping_divisions where roping_id = division_record.roping_id and incentive_enabled
  ) where id = division_record.roping_id;
  return removed_entries;
end;
$$;

revoke all on function public.remove_roping_from_event(uuid, text) from public;
grant execute on function public.remove_roping_from_event(uuid, text) to authenticated;
