alter table public.event_ropings add column dismissed_template_review_token text;

-- Compare values rather than timestamps: fee, classification, and payout edits
-- can change a template without changing its parent row's updated_at.
create function public.event_roping_template_snapshot(target_id uuid, from_template boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r public.event_ropings%rowtype;
  t public.roping_templates%rowtype;
  row_json jsonb;
  format_json jsonb;
  fees_json jsonb;
  short_json jsonb;
  handicap_json jsonb;
  payouts_json jsonb := '[]';
  plan_json jsonb;
  bracket_json jsonb;
  plan record;
begin
  select * into r from public.event_ropings where id = target_id;
  select * into t from public.roping_templates where id = r.roping_template_id and producer_id = r.producer_id;
  if r.id is null or (from_template and t.id is null) then return null; end if;
  row_json := case when from_template then to_jsonb(t) else to_jsonb(r) end;
  select jsonb_object_agg(key, value) into format_json from jsonb_each(row_json)
  where key = any(array['description','division_id','main_round_count','max_entries_per_roper',
    'allow_non_members','eligibility_rules','scoring_rules','timer_count','timer_resolution',
    'minimum_positions_between_entries','competition_format','second_round_ordering',
    'later_round_ordering','cattle_draw_enabled']);
  if from_template then
    select coalesce(jsonb_agg(jsonb_build_object(
      'source_fee_id', f.id, 'title', f.title, 'amount_cents', f.amount_cents,
      'scope', f.scope, 'included_in_entry_price', f.included_in_entry_price,
      'contributes_to_payout', f.contributes_to_payout, 'is_required', f.is_required,
      'sort_order', f.sort_order, 'kind', f.kind) order by f.id), '[]') into fees_json
    from public.roping_template_fees f where f.roping_template_id = t.id;
    short_json := jsonb_build_object('enabled', t.short_round_enabled, 'tie_policy', t.short_round_tie_policy,
      'brackets', case when t.short_round_enabled then (
        select coalesce(jsonb_agg(b order by (b->>'minimumEntries')::integer), '[]')
        from jsonb_array_elements(t.short_round_brackets) b
      ) else '[]'::jsonb end);
    select coalesce(jsonb_agg(jsonb_build_object('classification_id', c.id, 'classification', c.name,
      'credit_seconds', c.handicap_adjustment_seconds) order by c.id), '[]') into handicap_json
    from public.classifications c where t.competition_format = 'handicap'
      and c.producer_id = r.producer_id and c.division_id = t.division_id
      and c.id in (select (b->>'classificationId')::uuid from jsonb_array_elements(t.handicap_rules) b);
  else
    select coalesce(jsonb_agg(jsonb_build_object(
      'source_fee_id', f.roping_template_fee_id, 'title', f.title, 'amount_cents', f.amount_cents,
      'scope', f.scope, 'included_in_entry_price', f.included_in_entry_price,
      'contributes_to_payout', f.contributes_to_payout, 'is_required', f.is_required,
      'sort_order', f.sort_order, 'kind', f.kind) order by f.roping_template_fee_id, f.id), '[]') into fees_json
    from public.event_fees f where f.event_roping_id = r.id;
    short_json := jsonb_build_object('enabled', r.short_round_enabled, 'tie_policy', r.short_round_tie_policy,
      'brackets', coalesce((select jsonb_agg(jsonb_build_object('minimumEntries', b.minimum_entries,
        'maximumEntries', b.maximum_entries, 'comebackCount', b.comeback_count) order by b.minimum_entries)
        from public.event_roping_short_round_brackets b where b.event_roping_id = r.id), '[]'));
    select coalesce(jsonb_agg(jsonb_build_object('classification_id', c.id, 'classification', c.name,
      'credit_seconds', a.handicap_time_credit_seconds) order by c.id), '[]') into handicap_json
    from public.event_roping_handicap_adjustments a join public.classifications c on c.id = a.classification_id
    where a.event_roping_id = r.id;
  end if;

  for plan in
    select s.id as schedule_id, null::uuid as plan_id, null::uuid as source_fee_id,
      'Main purse'::text as title, true as main_pool
    from public.payout_schedules s where from_template and s.id = t.payout_schedule_id
    union all
    select s.id, null::uuid, f.id, f.title, false
    from public.roping_template_fees f join public.payout_schedules s on s.id = f.payout_schedule_id
    where from_template and f.roping_template_id = t.id and f.kind in ('side_pot','insurance')
    union all
    select p.source_schedule_id, p.id, f.roping_template_fee_id,
      case when p.pool_type = 'main' then 'Main purse' else f.title end, p.pool_type = 'main'
    from public.event_roping_payout_plans p left join public.event_fees f on f.id = p.event_fee_id
    where not from_template and p.event_roping_id = r.id
    order by source_fee_id nulls first
  loop
    if from_template then
      select jsonb_build_object('schedule_id', s.id, 'title', plan.title,
        'source_fee_id', plan.source_fee_id,
        'added_money_cents', case when plan.main_pool then s.default_added_money_cents else 0 end,
        'payback_basis_points', case when plan.main_pool then s.payback_basis_points else 10000 end,
        'go_rounds_basis_points', s.go_rounds_basis_points,
        'aggregate_basis_points', s.aggregate_basis_points + case when t.short_round_enabled then 0 else s.short_round_basis_points end,
        'short_round_basis_points', case when t.short_round_enabled then s.short_round_basis_points else 0 end)
      into plan_json from public.payout_schedules s where s.id = plan.schedule_id;
      select coalesce(jsonb_agg(jsonb_build_object('stage', b.stage_type,
        'minimum_entries', b.minimum_entries, 'maximum_entries', b.maximum_entries,
        'places', coalesce((select jsonb_agg(jsonb_build_object('place', p.place_number,
          'percentage_basis_points', p.percentage_basis_points) order by p.place_number)
          from public.payout_schedule_places p where p.payout_bracket_id = b.id), '[]'))
        order by b.stage_type, b.minimum_entries), '[]') into bracket_json
      from public.payout_schedule_brackets b where b.payout_schedule_id = plan.schedule_id;
    else
      select jsonb_build_object('schedule_id', p.source_schedule_id, 'title', plan.title,
        'source_fee_id', plan.source_fee_id, 'added_money_cents', p.added_money_cents,
        'payback_basis_points', p.payback_basis_points, 'go_rounds_basis_points', p.go_rounds_basis_points,
        'aggregate_basis_points', p.aggregate_basis_points, 'short_round_basis_points', p.short_round_basis_points)
      into plan_json from public.event_roping_payout_plans p where p.id = plan.plan_id;
      select coalesce(jsonb_agg(jsonb_build_object('stage', b.stage_type,
        'minimum_entries', b.minimum_entries, 'maximum_entries', b.maximum_entries,
        'places', coalesce((select jsonb_agg(jsonb_build_object('place', p.place_number,
          'percentage_basis_points', p.percentage_basis_points) order by p.place_number)
          from public.event_roping_payout_places p where p.payout_bracket_id = b.id), '[]'))
        order by b.stage_type, b.minimum_entries), '[]') into bracket_json
      from public.event_roping_payout_brackets b where b.payout_plan_id = plan.plan_id;
    end if;
    payouts_json := payouts_json || jsonb_build_array(plan_json || jsonb_build_object('brackets', bracket_json));
  end loop;
  return jsonb_build_object('format', format_json, 'fees', fees_json, 'short_round', short_json,
    'handicap', handicap_json, 'payouts', payouts_json, 'four_d',
    case when from_template then (select s.four_d_settings from public.payout_schedules s
      where s.id = t.payout_schedule_id and t.competition_format = 'four_d') else r.four_d_settings end);
end;
$$;
revoke all on function public.event_roping_template_snapshot(uuid, boolean) from public, authenticated;

create function public.get_event_template_reviews(target_event_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record;
  current_settings jsonb;
  template_settings jsonb;
  review_token text;
  changes jsonb;
  blocked_reason text;
  result jsonb := '[]';
begin
  if not exists (select 1 from public.events e where e.id = target_event_id
    and public.has_organization_access(e.producer_id)) then raise exception 'Event access is required'; end if;
  for r in select er.*, t.name as template_name, t.is_active as template_active, e.status as event_status,
    (select count(*) from public.roping_entries x where x.event_roping_id = er.id) as entry_count
    from public.event_ropings er join public.events e on e.id = er.event_id
    join public.roping_templates t on t.id = er.roping_template_id and t.producer_id = er.producer_id
    where er.event_id = target_event_id
  loop
    current_settings := public.event_roping_template_snapshot(r.id, false);
    template_settings := public.event_roping_template_snapshot(r.id, true);
    if current_settings = template_settings then continue; end if;
    review_token := md5(current_settings::text || template_settings::text);
    select jsonb_agg(jsonb_build_object('section', key, 'current', current_settings->key, 'template', value) order by key)
      into changes from jsonb_each(template_settings) where value is distinct from current_settings->key;
    blocked_reason := null;
    if not r.template_active then blocked_reason := 'This template is inactive.';
    elsif r.event_status in ('completed','cancelled') or r.event_day_status in ('in_progress','completed')
      or exists (select 1 from public.competition_runs where event_roping_id = r.id and status <> 'pending')
      or exists (select 1 from public.event_roping_rounds where event_roping_id = r.id and status = 'locked') then
      blocked_reason := 'This roping has started or the event is closed. Its settings are protected.';
    elsif r.entry_count > 0 and (
      ((current_settings->'format') - 'description') is distinct from ((template_settings->'format') - 'description')
      or current_settings->'short_round' is distinct from template_settings->'short_round'
      or current_settings->'handicap' is distinct from template_settings->'handicap'
      or current_settings->'four_d' is distinct from template_settings->'four_d') then
      blocked_reason := 'Format or eligibility changes cannot be applied while this roping has entries.';
    end if;
    result := result || jsonb_build_array(jsonb_build_object('ropingId', r.id, 'templateName', r.template_name,
      'token', review_token, 'dismissed', r.dismissed_template_review_token = review_token,
      'entryCount', r.entry_count, 'blockedReason', blocked_reason, 'changes', changes));
  end loop;
  return result;
end;
$$;
revoke all on function public.get_event_template_reviews(uuid) from public;
grant execute on function public.get_event_template_reviews(uuid) to authenticated;
