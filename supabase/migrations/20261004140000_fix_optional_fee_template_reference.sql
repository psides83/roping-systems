create or replace function public.create_optional_fee_payout_plan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_schedule_id uuid;
begin
  if new.kind not in ('side_pot', 'insurance')
    or new.roping_template_fee_id is null
    or new.event_roping_id is null then
    return new;
  end if;

  select payout_schedule_id into source_schedule_id
  from public.roping_template_fees
  where id = new.roping_template_fee_id
    and producer_id = new.producer_id;

  if source_schedule_id is not null then
    perform public.copy_payout_schedule_to_event(
      new.producer_id, new.event_id, new.event_roping_id,
      new.id, source_schedule_id, new.title, 'side_pot'
    );
  end if;
  return new;
end;
$$;
