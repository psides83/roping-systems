-- Run with: supabase db query --linked --file supabase/tests/template_update_reviews.sql
-- Uses the linked producer's existing format setup; all fixture changes roll back.
begin;
do $$
declare
  producer_uuid uuid;
  manager_uuid uuid;
  template_uuid uuid;
  classification_uuid uuid;
  event_uuid uuid;
  roping_uuid uuid;
  roper_uuid uuid;
  entry_uuid uuid;
  required_fee_uuid uuid;
  optional_fee_uuid uuid;
  required_fee_source uuid;
  review jsonb;
  old_token text;
  charges_before jsonb;
  schedule_before jsonb;
  failed boolean;
  round_count integer;
begin
  select producer_id,user_id into strict producer_uuid,manager_uuid from public.producer_staff where role='owner' limit 1;
  perform set_config('request.jwt.claim.sub',manager_uuid::text,true);
  select t.id,t.main_round_count into strict template_uuid,round_count from public.roping_templates t
    where t.producer_id=producer_uuid and t.is_active and t.competition_format='standard'
      and exists (select 1 from public.classifications c where c.division_id=t.division_id and c.eligibility_type='open' and c.is_active and c.standalone_enabled)
      and exists (select 1 from public.roping_template_fees f where f.roping_template_id=t.id and f.is_required)
      and exists (select 1 from public.roping_template_fees f where f.roping_template_id=t.id and not f.is_required)
    limit 1;
  select c.id into strict classification_uuid from public.classifications c join public.roping_templates t on t.division_id=c.division_id
    where t.id=template_uuid and c.eligibility_type='open' and c.is_active and c.standalone_enabled limit 1;
  insert into public.events(producer_id,title,slug,starts_at,ends_at,status,arena_count)
    values(producer_uuid,'Template sync regression', 'template-sync-'||gen_random_uuid(),now(),now()+interval '1 day','draft',2) returning id into event_uuid;
  roping_uuid:=public.add_roping_to_event(event_uuid,template_uuid,classification_uuid,
    (now() at time zone (select timezone from public.producers where id=producer_uuid))::date,
    'fixed',(now() at time zone (select timezone from public.producers where id=producer_uuid)),
    'Schedule must remain unchanged','Arena 2',round_count,false);
  if public.get_event_template_reviews(event_uuid)<>'[]'::jsonb then raise exception 'A new roping should match its template'; end if;
  update public.roping_templates set main_round_count=main_round_count+1 where id=template_uuid;
  review:=public.get_event_template_reviews(event_uuid)->0;
  perform public.confirm_event_roping_template_update(producer_uuid,event_uuid,roping_uuid,review->>'token',false,false);
  if (select main_round_count from public.event_ropings where id=roping_uuid)<>round_count+1 then
    raise exception 'A round-count update before entries was not applied'; end if;
  insert into public.ropers(first_name,last_name,birth_date,competition_gender)
    values('Template','Regression','1990-01-01','female') returning id into roper_uuid;
  insert into public.memberships(producer_id,roper_id,member_number,status,joined_on)
    values(producer_uuid,roper_uuid,'SYNC-'||gen_random_uuid(),'active',current_date);
  entry_uuid:=public.create_event_entry_with_eligibility_override(roping_uuid,roper_uuid,'office','unpaid',null);
  select id,roping_template_fee_id into strict required_fee_uuid,required_fee_source from public.event_fees
    where event_roping_id=roping_uuid and is_required limit 1;
  select id into strict optional_fee_uuid from public.event_fees where event_roping_id=roping_uuid and not is_required limit 1;
  perform public.add_entry_option(entry_uuid,optional_fee_uuid);
  select jsonb_agg(to_jsonb(c) order by c.id) into charges_before from public.entry_charges c where c.entry_id=entry_uuid;
  select jsonb_build_object('date',scheduled_date,'starts',starts_at,'arena',arena_name,'note',schedule_note,'classification',classification_id)
    into schedule_before from public.event_ropings where id=roping_uuid;
  update public.roping_template_fees set contributes_to_payout=not contributes_to_payout where id=required_fee_source;
  review:=public.get_event_template_reviews(event_uuid)->0;
  if review->>'blockedReason' is not null then raise exception 'Purse contribution updates should be allowed with entries'; end if;
  old_token:=review->>'token';
  perform public.confirm_event_roping_template_update(producer_uuid,event_uuid,roping_uuid,old_token,true,false);
  if not (public.get_event_template_reviews(event_uuid)->0->>'dismissed')::boolean then raise exception 'Keep current should dismiss this revision'; end if;
  failed:=false;
  begin
    perform public.confirm_event_roping_template_update(producer_uuid,event_uuid,roping_uuid,md5('stale'),false,true);
  exception when others then
    if sqlerrm not like 'Settings changed after%' then raise; end if;
    failed:=true;
  end;
  if not failed then raise exception 'A stale review was accepted'; end if;
  perform public.confirm_event_roping_template_update(producer_uuid,event_uuid,roping_uuid,old_token,false,true);
  if public.get_event_template_reviews(event_uuid)<>'[]'::jsonb then raise exception 'The synchronized roping still differs'; end if;
  if charges_before is distinct from (select jsonb_agg(to_jsonb(c) order by c.id) from public.entry_charges c where c.entry_id=entry_uuid) then
    raise exception 'Purse correction changed charges or optional selections'; end if;
  if schedule_before is distinct from (select jsonb_build_object('date',scheduled_date,'starts',starts_at,'arena',arena_name,'note',schedule_note,'classification',classification_id)
    from public.event_ropings where id=roping_uuid) then raise exception 'Schedule or classification was changed'; end if;
  if not exists(select 1 from public.producer_audit_log where entity_id=roping_uuid and actor_user_id=manager_uuid and after_data->>'change_reason'='Updated from roping template') then
    raise exception 'Template update was not attributed in the audit log'; end if;
  update public.payout_schedules set default_added_money_cents=default_added_money_cents+2500
    where id=(select payout_schedule_id from public.roping_templates where id=template_uuid);
  review:=public.get_event_template_reviews(event_uuid)->0;
  if not exists(select 1 from jsonb_array_elements(review->'changes') c where c->>'section'='payouts') then
    raise exception 'Payout schedule edits were not detected'; end if;
  perform public.confirm_event_roping_template_update(producer_uuid,event_uuid,roping_uuid,review->>'token',false,true);
  if public.get_event_template_reviews(event_uuid)<>'[]'::jsonb then raise exception 'Payout schedule was not synchronized'; end if;

  update public.roping_template_fees set amount_cents=amount_cents+100 where id=required_fee_source;
  review:=public.get_event_template_reviews(event_uuid)->0;
  if (review->>'dismissed')::boolean then raise exception 'A new template revision stayed dismissed'; end if;
  perform public.confirm_event_roping_template_update(producer_uuid,event_uuid,roping_uuid,review->>'token',false,true);
  if not exists(select 1 from public.entry_charges c join public.event_fees f on f.id=c.event_fee_id
    where c.entry_id=entry_uuid and f.id=required_fee_uuid and c.amount_cents=f.amount_cents) then raise exception 'Unpaid charges were not recalculated'; end if;

  update public.roping_entries set payment_status='paid_cash' where id=entry_uuid;
  update public.roping_template_fees set amount_cents=amount_cents+100 where id=required_fee_source;
  review:=public.get_event_template_reviews(event_uuid)->0;
  failed:=false;
  begin
    perform public.confirm_event_roping_template_update(producer_uuid,event_uuid,roping_uuid,review->>'token',false,true);
  exception when others then
    if sqlerrm not like 'This update changes fees%' then raise; end if;
    failed:=true;
  end;
  if not failed then raise exception 'Paid entry fees were overwritten'; end if;
  update public.roping_template_fees set amount_cents=amount_cents-100,
    contributes_to_payout=not contributes_to_payout where id=required_fee_source;
  review:=public.get_event_template_reviews(event_uuid)->0;
  perform public.confirm_event_roping_template_update(producer_uuid,event_uuid,roping_uuid,review->>'token',false,true);
  if (select payment_status from public.roping_entries where id=entry_uuid)<>'paid_cash' then
    raise exception 'A purse-only correction changed the paid entry status'; end if;
  if public.get_event_template_reviews(event_uuid)<>'[]'::jsonb then
    raise exception 'Purse-only corrections should be allowed for paid entries'; end if;
  update public.roping_templates set main_round_count=main_round_count+1 where id=template_uuid;
  review:=public.get_event_template_reviews(event_uuid)->0;
  if review->>'blockedReason' not like 'Format or eligibility%' then raise exception 'Structural changes with entries were not blocked'; end if;
  update public.event_ropings set event_day_status='in_progress' where id=roping_uuid;
  review:=public.get_event_template_reviews(event_uuid)->0;
  if review->>'blockedReason' not like 'This roping has started%' then raise exception 'Started roping was not protected'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  failed:=false;
  begin
    perform public.confirm_event_roping_template_update(producer_uuid,event_uuid,roping_uuid,review->>'token',false,true);
  exception when others then
    if sqlerrm<>'Manager access is required' then raise; end if;
    failed:=true;
  end;
  if not failed then raise exception 'Unauthorized update was accepted'; end if;
end;
$$;
rollback;
select 'Template sync regression scenarios passed. All fixture changes rolled back.' as result;
