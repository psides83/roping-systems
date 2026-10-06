create function public.copy_event_day_schedule(target_event_id uuid, source_date date, destination_date date)
returns integer language plpgsql security definer set search_path = '' as $$
declare event public.events%rowtype; zone text; r public.event_ropings%rowtype;
  fee public.event_fees%rowtype; plan public.event_roping_payout_plans%rowtype;
  bracket public.event_roping_payout_brackets%rowtype;
  roping_id uuid; fee_id uuid; plan_id uuid; bracket_id uuid;
  fee_map jsonb; sequence integer; copied integer := 0;
begin
  select * into event from public.events where id=target_event_id for update;
  if event.id is null or not public.can_manage_organization(event.producer_id) then
    raise exception 'You do not have permission to edit this event';
  end if;
  if event.status in ('in_progress','completed','cancelled') then
    raise exception 'Event setup cannot change after the event has started';
  end if;
  select timezone into zone from public.producers where id=event.producer_id;
  if source_date is null or destination_date is null or source_date=destination_date then
    raise exception 'Choose a different event date';
  end if;
  if destination_date < (event.starts_at at time zone zone)::date
    or destination_date > (coalesce(event.ends_at,event.starts_at) at time zone zone)::date then
    raise exception 'Choose a date within this event';
  end if;
  if exists(select 1 from public.event_ropings where event_id=event.id and scheduled_date=destination_date) then
    raise exception 'That day already has ropings. Choose an empty day';
  end if;
  select coalesce(max(sort_order),0) into sequence from public.event_ropings where event_id=event.id;
  for r in select * from public.event_ropings where event_id=event.id and scheduled_date=source_date
    order by sort_order,created_at,id for share loop
    roping_id:=gen_random_uuid(); sequence:=sequence+1; fee_map:='{}'::jsonb;
    insert into public.event_ropings select (jsonb_populate_record(null::public.event_ropings,
      to_jsonb(r)||jsonb_build_object('id',roping_id,'scheduled_date',destination_date,
        'starts_at',case when r.starts_at is null then null else
          (destination_date+(r.starts_at at time zone zone)::time) at time zone zone end,
        'sort_order',sequence,'created_at',now(),'result_status','unofficial',
        'event_day_status','scheduled','estimated_starts_at',null,'event_day_note',null,
        'event_day_updated_at',null,'event_day_updated_by',null,'short_round_seeded_at',null,
        'short_round_locked_at',null,'short_round_locked_by',null,'payouts_finalized_at',null,
        'payouts_finalized_by',null,'dismissed_template_review_token',null))).*;
    for fee in select * from public.event_fees where event_roping_id=r.id order by sort_order,id loop
      fee_id:=gen_random_uuid(); fee_map:=fee_map||jsonb_build_object(fee.id::text,fee_id);
      insert into public.event_fees select (jsonb_populate_record(null::public.event_fees,
        to_jsonb(fee)||jsonb_build_object('id',fee_id,'event_roping_id',roping_id,'created_at',now()))).*;
    end loop;
    insert into public.event_roping_handicap_adjustments
      select (jsonb_populate_record(null::public.event_roping_handicap_adjustments,
        to_jsonb(a)||jsonb_build_object('id',gen_random_uuid(),'event_roping_id',roping_id,'created_at',now(),'updated_at',now()))).*
      from public.event_roping_handicap_adjustments a where a.event_roping_id=r.id;
    insert into public.event_roping_short_round_brackets
      select (jsonb_populate_record(null::public.event_roping_short_round_brackets,
        to_jsonb(b)||jsonb_build_object('id',gen_random_uuid(),'event_roping_id',roping_id,'created_at',now(),'updated_at',now()))).*
      from public.event_roping_short_round_brackets b where b.event_roping_id=r.id;
    for plan in select * from public.event_roping_payout_plans where event_roping_id=r.id loop
      plan_id:=gen_random_uuid();
      insert into public.event_roping_payout_plans select (jsonb_populate_record(null::public.event_roping_payout_plans,
        to_jsonb(plan)||jsonb_build_object('id',plan_id,'event_roping_id',roping_id,
          'event_fee_id',(fee_map->>plan.event_fee_id::text)::uuid,'added_money_cents',0,'created_at',now(),'updated_at',now()))).*;
      for bracket in select * from public.event_roping_payout_brackets where payout_plan_id=plan.id loop
        bracket_id:=gen_random_uuid();
        insert into public.event_roping_payout_brackets select (jsonb_populate_record(null::public.event_roping_payout_brackets,
          to_jsonb(bracket)||jsonb_build_object('id',bracket_id,'payout_plan_id',plan_id,'created_at',now()))).*;
        insert into public.event_roping_payout_places select (jsonb_populate_record(null::public.event_roping_payout_places,
          to_jsonb(p)||jsonb_build_object('id',gen_random_uuid(),'payout_bracket_id',bracket_id,'created_at',now()))).*
          from public.event_roping_payout_places p where p.payout_bracket_id=bracket.id;
      end loop;
    end loop;
    copied:=copied+1;
  end loop;
  if copied=0 then raise exception 'There are no ropings on the source date'; end if;
  return copied;
end;
$$;
revoke all on function public.copy_event_day_schedule(uuid,date,date) from public;
grant execute on function public.copy_event_day_schedule(uuid,date,date) to authenticated;
