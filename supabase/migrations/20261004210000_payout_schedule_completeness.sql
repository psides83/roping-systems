-- Validate at the assignment boundary; existing event snapshots remain unchanged.
create or replace function public.require_complete_payout_schedule()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  schedule_id uuid;
  s public.payout_schedules%rowtype;
  stage record;
  b record;
  d jsonb;
  next_entry bigint;
  required_places integer;
begin
  if tg_table_name = 'event_roping_payout_plans' then
    schedule_id := new.source_schedule_id;
  else
    schedule_id := new.payout_schedule_id;
  end if;
  if schedule_id is null then return new; end if;
  select * into s from public.payout_schedules where id = schedule_id;
  if s.id is null then raise exception 'Payout schedule is unavailable.'; end if;
  for stage in select * from (values
    ('go_round', s.go_rounds_basis_points),
    ('aggregate', s.aggregate_basis_points),
    ('short_round', case when s.short_round_enabled then s.short_round_basis_points else 0 end)
  ) as stages(name, allocation) where allocation > 0 loop
    next_entry := 1;
    for b in select pb.*, (select count(*) from public.payout_schedule_places p where p.payout_bracket_id = pb.id) as places,
      (select sum(p.percentage_basis_points) from public.payout_schedule_places p where p.payout_bracket_id = pb.id) as total
      from public.payout_schedule_brackets pb where pb.payout_schedule_id = s.id and pb.stage_type::text = stage.name order by pb.minimum_entries loop
      if b.minimum_entries <> next_entry or coalesce(b.total, 0) <> 10000 then
        raise exception 'Payout schedule is incomplete: check % entry ranges and percentages.', stage.name;
      end if;
      if s.competition_format = 'four_d' and stage.name = 'go_round' then
        for d in select value from jsonb_array_elements(s.four_d_settings->'brackets') loop
          if b.minimum_entries <= coalesce((d->>'maximumEntries')::bigint, 2147483647) and (d->>'minimumEntries')::bigint <= coalesce(b.maximum_entries, 2147483647) then
            select max(value::text::integer) into required_places from jsonb_array_elements(d->'placesByDivision') with ordinality as p(value, position) where position <= (d->>'activeDivisions')::integer;
            if b.places < required_places then raise exception 'Payout schedule is incomplete: 4D requires % paid-place percentages in this entry range.', required_places; end if;
          end if;
        end loop;
      end if;
      next_entry := coalesce(b.maximum_entries::bigint + 1, 2147483648);
    end loop;
    if next_entry <> 2147483648 then raise exception 'Payout schedule is incomplete: % must cover every entry count with an unlimited final range.', stage.name; end if;
  end loop;
  return new;
end;
$$;

create trigger require_complete_template_payout before insert or update of payout_schedule_id on public.roping_templates
for each row execute function public.require_complete_payout_schedule();
create trigger require_complete_template_fee_payout before insert or update of payout_schedule_id on public.roping_template_fees
for each row execute function public.require_complete_payout_schedule();
create trigger require_complete_event_payout before insert or update of source_schedule_id on public.event_roping_payout_plans
for each row execute function public.require_complete_payout_schedule();
