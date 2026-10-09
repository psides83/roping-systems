-- Read-only compatibility checks; no producer records are modified.
begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text
  from public.producer_staff where role='owner' order by created_at,user_id limit 1),true);
set local role authenticated;
do $$
declare producer public.producers; season uuid; event uuid; fund uuid; source jsonb;
begin
  select * into producer from public.producers where public.can_manage_organization(id) order by id limit 1;
  if producer.id is null then raise exception 'Reports test needs an owner fixture'; end if;
  select id into season from public.producer_seasons where producer_id=producer.id order by starts_on desc,id limit 1;
  if season is not null then
    source:=public.public_season_standings_source(producer.slug,season);
    if jsonb_typeof(source->'contributions')<>'array' or jsonb_typeof(source->'ropers')<>'array' then raise exception 'Invalid standings source'; end if;
  end if;
  select id into event from public.events where producer_id=producer.id order by starts_at desc,id limit 1;
  if event is not null then
    perform fee_id,collected_cents,outstanding_cents from public.event_fee_collection_summary(event);
    perform plan_id,award_key,payout_cents,paid_cents from public.event_payout_register_awards(event);
  end if;
  select id into fund from public.producer_funds where producer_id=producer.id order by id limit 1;
  if fund is not null then perform id,amount_cents,balance_cents from public.producer_fund_ledger(fund,0); end if;
end $$;
reset role;
rollback;
