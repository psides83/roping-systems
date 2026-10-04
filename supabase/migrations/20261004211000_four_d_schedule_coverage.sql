create or replace function public.require_complete_four_d_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  schedule_id uuid;
  s public.payout_schedules%rowtype;
  d jsonb;
  next_entry bigint := 1;
  active integer;
  n integer;
  total integer;
begin
  if tg_table_name = 'event_roping_payout_plans' then schedule_id := new.source_schedule_id;
  else schedule_id := new.payout_schedule_id; end if;
  if schedule_id is null then return new; end if;
  select * into s from public.payout_schedules where id = schedule_id;
  if s.go_rounds_basis_points + s.aggregate_basis_points + (case when s.short_round_enabled then s.short_round_basis_points else 0 end) <> 10000 then
    raise exception 'Payout schedule is incomplete: purse allocations must total 100%%.';
  end if;
  if s.competition_format <> 'four_d' then return new; end if;
  if s.four_d_settings is null or coalesce((s.four_d_settings->>'splitSeconds')::numeric, 0) <= 0 then
    raise exception 'Payout schedule is incomplete: complete the 4D settings.';
  end if;
  for d in select value from jsonb_array_elements(s.four_d_settings->'brackets') order by (value->>'minimumEntries')::integer loop
    if (d->>'minimumEntries')::bigint <> next_entry or (d->>'maximumEntries')::bigint < (d->>'minimumEntries')::bigint then
      raise exception 'Payout schedule is incomplete: 4D entry ranges must have no gaps or overlaps.';
    end if;
    active := (d->>'activeDivisions')::integer;
    if active not between 1 and 4 or jsonb_array_length(d->'placesByDivision') <> 4 or jsonb_array_length(d->'purseBasisPoints') <> 4 then
      raise exception 'Payout schedule is incomplete: check the active Ds and paid places.';
    end if;
    total := 0;
    for n in 0..3 loop
      if n < active then
        if (d->'placesByDivision'->>n)::integer < 1 or (d->'purseBasisPoints'->>n)::integer <= 0 then
          raise exception 'Payout schedule is incomplete: every active D needs paid places and a purse.';
        end if;
      elsif (d->'placesByDivision'->>n)::integer <> 0 or (d->'purseBasisPoints'->>n)::integer <> 0 then
        raise exception 'Payout schedule is incomplete: inactive Ds cannot have places or a purse.';
      end if;
      total := total + (d->'purseBasisPoints'->>n)::integer;
    end loop;
    if total <> 10000 then raise exception 'Payout schedule is incomplete: 4D purse percentages must total 100%%.'; end if;
    next_entry := coalesce((d->>'maximumEntries')::bigint + 1, 2147483648);
  end loop;
  if next_entry <> 2147483648 then raise exception 'Payout schedule is incomplete: 4D needs an unlimited final entry range.'; end if;
  return new;
end;
$$;
create trigger require_complete_four_d_template before insert or update of payout_schedule_id on public.roping_templates
for each row execute function public.require_complete_four_d_schedule();
create trigger require_complete_four_d_fee before insert or update of payout_schedule_id on public.roping_template_fees
for each row execute function public.require_complete_four_d_schedule();
create trigger require_complete_four_d_event before insert or update of source_schedule_id on public.event_roping_payout_plans
for each row execute function public.require_complete_four_d_schedule();
