create function public.confirm_event_roping_template_update(
  target_producer_id uuid, target_event_id uuid, target_roping_id uuid,
  expected_review_token text, keep_current boolean, confirm_entry_changes boolean default false
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r public.event_ropings%rowtype;
  t public.roping_templates%rowtype;
  review jsonb;
  before_settings jsonb;
  after_settings jsonb;
  fee public.roping_template_fees%rowtype;
  copied_fee public.event_fees%rowtype;
  copied_fee_id uuid;
  has_entries boolean;
  changes_balances boolean;
  adjustment record;
begin
  if not public.can_manage_organization(target_producer_id) then raise exception 'Manager access is required'; end if;
  perform 1 from public.events where id = target_event_id and producer_id = target_producer_id for update;
  if not found then raise exception 'Event not found in this producer'; end if;
  select * into r from public.event_ropings where id = target_roping_id
    and event_id = target_event_id and producer_id = target_producer_id for update;
  if not found then raise exception 'Roping not found in this event'; end if;

  -- Freeze template inputs and financial/activity records for this short,
  -- explicit administrative operation, including concurrent entry submissions.
  lock table public.roping_templates, public.roping_template_fees,
    public.payout_schedules, public.payout_schedule_brackets,
    public.payout_schedule_places, public.classifications in share mode;
  lock table public.roping_entries, public.entry_charges, public.event_fees,
    public.competition_runs, public.event_roping_rounds, public.event_payments,
    public.payout_disbursements in share row exclusive mode;

  select value into review from jsonb_array_elements(public.get_event_template_reviews(target_event_id))
    where value->>'ropingId' = target_roping_id::text;
  if review is null then raise exception 'This roping already matches its template'; end if;
  if review->>'token' is distinct from expected_review_token then
    raise exception 'Settings changed after this review opened. Refresh and review the latest changes.';
  end if;
  if keep_current then
    update public.event_ropings set dismissed_template_review_token = expected_review_token where id = r.id;
    return;
  end if;
  if review->>'blockedReason' is not null then raise exception '%', review->>'blockedReason'; end if;
  has_entries := (review->>'entryCount')::integer > 0;
  if has_entries and not confirm_entry_changes then raise exception 'Confirm the update for existing entries before continuing'; end if;
  if exists (select 1 from public.payout_disbursements d join public.event_roping_payout_plans p
    on p.id = d.payout_plan_id where p.event_roping_id = r.id) then
    raise exception 'Payouts have been recorded for this roping. Its payout setup cannot be replaced.';
  end if;
  select * into strict t from public.roping_templates where id = r.roping_template_id and producer_id = r.producer_id;
  if t.division_id is distinct from r.division_id then
    raise exception 'The template division changed. Add a new roping with the correct classification instead.';
  end if;
  if t.competition_format <> 'handicap' and r.classification_id is null then
    raise exception 'This format needs a standalone classification. Add a new roping with that classification.';
  end if;

  before_settings := public.event_roping_template_snapshot(r.id, false);
  changes_balances := exists (
    select 1 from (select * from public.event_fees where event_roping_id = r.id) f
    full join (select * from public.roping_template_fees where roping_template_id = t.id) tf
      on tf.id = f.roping_template_fee_id
    where (f.id is not null and f.amount_cents is distinct from tf.amount_cents)
      or (f.id is null and tf.is_required)
  );
  if has_entries and changes_balances and (
    exists (select 1 from public.roping_entries x where x.event_roping_id = r.id and x.payment_status <> 'unpaid')
    or exists (select 1 from public.event_payments p where p.event_id = r.event_id and p.voided_at is null
      and p.roper_id in (select roper_id from public.roping_entries where event_roping_id = r.id))
  ) then raise exception 'This update changes fees for contestants with recorded payments. Keep the current settings until their balances are reconciled.'; end if;

  if has_entries and exists (
    select 1 from public.event_fees f left join public.roping_template_fees tf
      on tf.id = f.roping_template_fee_id and tf.roping_template_id = t.id
    where f.event_roping_id = r.id and (
      (tf.id is null and exists (select 1 from public.entry_charges c where c.event_fee_id = f.id))
      or (tf.id is not null and (f.scope <> tf.scope or f.kind <> tf.kind or f.is_required <> tf.is_required))
    )
  ) then raise exception 'An existing entry uses a removed fee, or a fee changed its scope, type, or required status. Keep the current settings to preserve those entry choices.'; end if;

  update public.event_ropings set description = t.description, main_round_count = t.main_round_count,
    max_entries_per_roper = t.max_entries_per_roper, allow_non_members = t.allow_non_members,
    eligibility_rules = t.eligibility_rules, scoring_rules = t.scoring_rules,
    timer_count = t.timer_count, timer_resolution = t.timer_resolution,
    minimum_positions_between_entries = t.minimum_positions_between_entries,
    competition_format = t.competition_format, second_round_ordering = t.second_round_ordering,
    later_round_ordering = t.later_round_ordering, cattle_draw_enabled = t.cattle_draw_enabled,
    incentive_enabled = t.competition_format = 'handicap',
    classification_id = case when t.competition_format = 'handicap' then null else r.classification_id end,
    four_d_settings = (select s.four_d_settings from public.payout_schedules s
      where s.id = t.payout_schedule_id and t.competition_format = 'four_d'),
    dismissed_template_review_token = null
  where id = r.id;
  if not has_entries then
    perform public.apply_template_short_round_settings(r.id);
    delete from public.event_roping_handicap_adjustments where event_roping_id = r.id;
    for adjustment in select c.id, c.handicap_adjustment_seconds from public.classifications c
      where t.competition_format = 'handicap' and c.producer_id = r.producer_id
        and c.division_id = r.division_id and c.is_active and c.handicap_adjustment_seconds is not null
        and c.id in (select (b->>'classificationId')::uuid from jsonb_array_elements(t.handicap_rules) b)
    loop
      insert into public.event_roping_handicap_adjustments
        (producer_id,event_id,event_roping_id,classification_id,handicap_time_credit_seconds)
      values (r.producer_id,r.event_id,r.id,adjustment.id,adjustment.handicap_adjustment_seconds);
    end loop;
  end if;

  delete from public.event_roping_payout_plans where event_roping_id = r.id;
  delete from public.event_fees f where f.event_roping_id = r.id
    and not exists (select 1 from public.roping_template_fees tf where tf.id = f.roping_template_fee_id and tf.roping_template_id = t.id);
  for fee in select * from public.roping_template_fees where roping_template_id = t.id order by sort_order, id
  loop
    select * into copied_fee from public.event_fees where event_roping_id = r.id and roping_template_fee_id = fee.id;
    if copied_fee.id is null then
      insert into public.event_fees (producer_id,event_id,event_roping_id,roping_template_fee_id,title,
        amount_cents,scope,included_in_entry_price,contributes_to_payout,is_required,sort_order,kind)
      values (r.producer_id,r.event_id,r.id,fee.id,fee.title,fee.amount_cents,fee.scope,
        fee.included_in_entry_price,fee.contributes_to_payout,fee.is_required,fee.sort_order,fee.kind)
      returning id into copied_fee_id;
    else
      copied_fee_id := copied_fee.id;
      update public.event_fees set title=fee.title,amount_cents=fee.amount_cents,scope=fee.scope,
        included_in_entry_price=fee.included_in_entry_price,contributes_to_payout=fee.contributes_to_payout,
        is_required=fee.is_required,sort_order=fee.sort_order,kind=fee.kind where id=copied_fee_id;
      update public.entry_charges set title=fee.title,amount_cents=fee.amount_cents where event_fee_id=copied_fee_id;
    end if;
    if fee.is_required then
      insert into public.entry_charges (producer_id,event_id,roper_id,entry_id,event_fee_id,title,amount_cents)
      select distinct r.producer_id,r.event_id,x.roper_id,
        case when fee.scope='entry' then x.id else null end,copied_fee_id,fee.title,fee.amount_cents
      from public.roping_entries x where x.event_roping_id=r.id and x.competition_status='active'
        and not exists (select 1 from public.entry_charges c where c.event_fee_id=copied_fee_id and
          ((fee.scope='entry' and c.entry_id=x.id) or (fee.scope<>'entry' and c.roper_id=x.roper_id and c.entry_id is null)));
    end if;
    if fee.kind in ('side_pot','insurance') and fee.payout_schedule_id is not null then
      perform public.copy_payout_schedule_to_event(r.producer_id,r.event_id,r.id,copied_fee_id,
        fee.payout_schedule_id,fee.title,'side_pot');
    end if;
  end loop;
  if t.payout_schedule_id is not null then
    perform public.copy_payout_schedule_to_event(r.producer_id,r.event_id,r.id,null,t.payout_schedule_id,r.name,'main');
  end if;
  after_settings := public.event_roping_template_snapshot(r.id, false);
  if after_settings is distinct from public.event_roping_template_snapshot(r.id, true) then
    raise exception 'The template could not be applied completely. No settings were changed.';
  end if;
  insert into public.producer_audit_log (producer_id,actor_user_id,entity_type,entity_id,action,before_data,after_data)
  values (r.producer_id,auth.uid(),'event_ropings',r.id,'update',before_settings,
    after_settings || jsonb_build_object('change_reason','Updated from roping template','template_id',t.id,'template_name',t.name));
end;
$$;
revoke all on function public.confirm_event_roping_template_update(uuid,uuid,uuid,text,boolean,boolean) from public;
grant execute on function public.confirm_event_roping_template_update(uuid,uuid,uuid,text,boolean,boolean) to authenticated;
