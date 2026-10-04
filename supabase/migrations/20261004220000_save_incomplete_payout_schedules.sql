-- Completeness is enforced when assigning/copying a schedule, not when saving work.
alter table public.payout_schedules drop constraint payout_schedule_stage_allocation_total;
alter table public.payout_schedules drop constraint payout_schedules_four_d_settings_valid;
alter table public.payout_schedule_places drop constraint payout_schedule_places_percentage_basis_points_check;
alter table public.payout_schedule_places add constraint payout_schedule_places_percentage_basis_points_check
  check (percentage_basis_points between 0 and 10000);

create function public.save_payout_schedule_draft(
  target_organization_id uuid, target_schedule_id uuid,
  schedule_name text, schedule_description text, added_money_cents integer,
  schedule_payback_basis_points integer, schedule_go_rounds_basis_points integer,
  schedule_aggregate_basis_points integer, schedule_short_round_basis_points integer,
  schedule_short_round_enabled boolean, schedule_competition_format public.competition_format,
  schedule_four_d_settings jsonb, schedule_brackets jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  saved_id uuid;
  bracket_id uuid;
  b jsonb;
  p jsonb;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'Manager access is required.';
  end if;
  if nullif(trim(schedule_name), '') is null then raise exception 'Schedule name is required.'; end if;
  if schedule_competition_format not in ('standard', 'four_d') then raise exception 'Choose a standard or 4D payout format.'; end if;
  if jsonb_typeof(schedule_brackets) is distinct from 'array' then raise exception 'Invalid payout brackets.'; end if;
  if schedule_four_d_settings is not null and jsonb_typeof(schedule_four_d_settings) <> 'object' then raise exception 'Invalid 4D settings.'; end if;
  if target_schedule_id is null then
    insert into public.payout_schedules (
      producer_id, name, description, default_added_money_cents,
      payback_basis_points, go_rounds_basis_points, aggregate_basis_points,
      short_round_basis_points, short_round_enabled, competition_format, four_d_settings
    ) values (
      target_organization_id, trim(schedule_name), nullif(trim(schedule_description), ''), added_money_cents,
      schedule_payback_basis_points, schedule_go_rounds_basis_points, schedule_aggregate_basis_points,
      schedule_short_round_basis_points, schedule_short_round_enabled, schedule_competition_format, schedule_four_d_settings
    ) returning id into saved_id;
  else
    update public.payout_schedules set
      name = trim(schedule_name), description = nullif(trim(schedule_description), ''),
      default_added_money_cents = added_money_cents, payback_basis_points = schedule_payback_basis_points,
      go_rounds_basis_points = schedule_go_rounds_basis_points, aggregate_basis_points = schedule_aggregate_basis_points,
      short_round_basis_points = schedule_short_round_basis_points, short_round_enabled = schedule_short_round_enabled,
      competition_format = schedule_competition_format, four_d_settings = schedule_four_d_settings
    where id = target_schedule_id and producer_id = target_organization_id returning id into saved_id;
    if saved_id is null then raise exception 'Payout schedule not found.'; end if;
    delete from public.payout_schedule_brackets where payout_schedule_id = saved_id;
  end if;
  for b in select value from jsonb_array_elements(schedule_brackets) loop
    if jsonb_typeof(b->'places') is distinct from 'array' then raise exception 'Invalid paid places.'; end if;
    insert into public.payout_schedule_brackets (producer_id, payout_schedule_id, stage_type, minimum_entries, maximum_entries)
    values (target_organization_id, saved_id, (b->>'stageType')::public.payout_stage_type,
      (b->>'minimumEntries')::integer, (b->>'maximumEntries')::integer) returning id into bracket_id;
    for p in select value from jsonb_array_elements(b->'places') loop
      insert into public.payout_schedule_places (producer_id, payout_bracket_id, place_number, percentage_basis_points)
      values (target_organization_id, bracket_id, (p->>'place')::integer, (p->>'percentageBasisPoints')::integer);
    end loop;
  end loop;
  return saved_id;
end;
$$;
revoke all on function public.save_payout_schedule_draft(uuid, uuid, text, text, integer, integer, integer, integer, integer, boolean, public.competition_format, jsonb, jsonb) from public;
grant execute on function public.save_payout_schedule_draft(uuid, uuid, text, text, integer, integer, integer, integer, integer, boolean, public.competition_format, jsonb, jsonb) to authenticated;

-- A zero percentage is valid draft data but never a usable paid place.
create function public.require_positive_payout_places()
returns trigger language plpgsql security definer set search_path = '' as $$
declare schedule_id uuid;
begin
  if tg_table_name = 'event_roping_payout_plans' then schedule_id := new.source_schedule_id;
  else schedule_id := new.payout_schedule_id; end if;
  if schedule_id is null then return new; end if;
  if exists (select 1 from public.payout_schedule_places p join public.payout_schedule_brackets b on b.id = p.payout_bracket_id
    join public.payout_schedules s on s.id = b.payout_schedule_id
    where s.id = schedule_id and p.percentage_basis_points = 0 and (
      (b.stage_type = 'go_round' and s.go_rounds_basis_points > 0) or
      (b.stage_type = 'aggregate' and s.aggregate_basis_points > 0) or
      (b.stage_type = 'short_round' and s.short_round_enabled and s.short_round_basis_points > 0))) then
    raise exception 'Payout schedule is incomplete: every paid place needs a positive percentage.';
  end if;
  if exists(select 1 from public.payout_schedules where id = schedule_id and short_round_enabled and short_round_basis_points = 0) then
    raise exception 'Payout schedule is incomplete: allocate a short-round purse.';
  end if;
  return new;
end;
$$;
create trigger require_positive_template_places before insert or update of payout_schedule_id on public.roping_templates for each row execute function public.require_positive_payout_places();
create trigger require_positive_fee_places before insert or update of payout_schedule_id on public.roping_template_fees for each row execute function public.require_positive_payout_places();
create trigger require_positive_event_places before insert or update of source_schedule_id on public.event_roping_payout_plans for each row execute function public.require_positive_payout_places();
