-- Remove legacy aliases after migrating every function to physical tables.
-- RPC argument and result names remain stable for existing callers.
create temporary table domain_table_names (old_name text, new_name text) on commit drop;
insert into domain_table_names values
    ('organizations', 'producers'),
    ('organization_users', 'producer_staff'),
    ('organization_memberships', 'memberships'),
    ('people', 'ropers'),
    ('skill_levels', 'legacy_skill_levels'),
    ('audit_log', 'producer_audit_log'),
    ('disciplines', 'divisions'),
    ('member_classifications', 'membership_classification_history'),
    ('classification_watch_events', 'classification_review_events'),
    ('classification_reviews', 'membership_classification_reviews'),
    ('division_templates', 'roping_templates'),
    ('fee_templates', 'roping_template_fees'),
    ('ropings', 'events'),
    ('roping_divisions', 'event_ropings'),
    ('roping_fees', 'event_fees'),
    ('roping_incentive_rules', 'event_roping_handicap_adjustments'),
    ('roping_short_round_brackets', 'event_roping_short_round_brackets'),
    ('roping_rounds', 'event_roping_rounds'),
    ('entries', 'roping_entries'),
    ('entry_transfers', 'entry_roping_transfers'),
    ('event_contestant_check_ins', 'event_check_ins'),
    ('runs', 'competition_runs'),
    ('roping_payout_plans', 'event_roping_payout_plans'),
    ('roping_payout_brackets', 'event_roping_payout_brackets'),
    ('roping_payout_places', 'event_roping_payout_places'),
    ('online_entry_requests', 'online_entry_submissions'),
    ('online_entry_request_items', 'online_entry_submission_ropings'),
    ('online_entry_request_options', 'online_entry_submission_fee_options');
create temporary table domain_column_names (old_name text, new_name text) on commit drop;
insert into domain_column_names values
    ('organization_id', 'producer_id'),
    ('person_id', 'roper_id'),
    ('discipline_id', 'division_id'),
    ('male_classification_discipline_id', 'male_classification_division_id'),
    ('roping_division_id', 'event_roping_id'),
    ('roping_id', 'event_id'),
    ('roping_fee_id', 'event_fee_id'),
    ('division_template_id', 'roping_template_id'),
    ('number_of_runs', 'main_round_count'),
    ('maximum_entries_per_person', 'max_entries_per_roper'),
    ('allow_guests', 'allow_non_members'),
    ('allow_guest_entries', 'allow_non_member_entries'),
    ('minimum_runs_between_entries', 'minimum_positions_between_entries'),
    ('run_number', 'round_number'),
    ('incentive_classification_id', 'handicap_classification_id'),
    ('incentive_adjustment_seconds', 'handicap_time_credit_seconds'),
    ('adjustment_seconds', 'handicap_time_credit_seconds'),
    ('watch_threshold', 'review_after_event_count'),
    ('request_id', 'submission_id'),
    ('request_item_id', 'submission_roping_id'),
    ('source_division_id', 'source_event_roping_id'),
    ('destination_division_id', 'destination_event_roping_id');

-- Finish consistent physical column names on supporting tables and reports.
do $migration$
declare
  item record;
begin
  for item in
    select relation.relname, relation.relkind, mapping.old_name, mapping.new_name
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    join pg_attribute column_info on column_info.attrelid = relation.oid
    join domain_column_names mapping on mapping.old_name = column_info.attname
    where namespace.nspname = 'public'
      and relation.relkind in ('r', 'v')
      and column_info.attnum > 0 and not column_info.attisdropped
      and not exists (select 1 from domain_table_names where old_name = relation.relname)
  loop
    execute format('alter %s public.%I rename column %I to %I',
      case when item.relkind = 'v' then 'view' else 'table' end,
      item.relname, item.old_name, item.new_name);
  end loop;
end;
$migration$;

-- Rebuild bodies without changing RPC signatures or grants.
do $migration$
declare
  routine record;
  mapping record;
  body text;
  definition text;
begin
  for routine in
    select procedure.oid, procedure.prosrc
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    join pg_language language on language.oid = procedure.prolang
    where namespace.nspname = 'public' and language.lanname in ('sql', 'plpgsql')
      and procedure.prokind = 'f'
  loop
    body := routine.prosrc;
    for mapping in select * from domain_table_names loop
      body := regexp_replace(body, 'public\.' || mapping.old_name || '\M',
        'public.' || mapping.new_name, 'g');
    end loop;
    for mapping in select * from domain_column_names loop
      body := regexp_replace(body, '\m' || mapping.old_name || '\M', mapping.new_name, 'g');
    end loop;
    body := replace(body, 'new.source_template_id', 'new.roping_template_id');
    body := replace(body, 'division.source_template_id', 'division.roping_template_id');
    body := replace(body, 'division_record.source_template_id', 'division_record.roping_template_id');
    body := replace(body, 'fee.source_template_id', 'fee.roping_template_fee_id');
    body := regexp_replace(body,
      '(insert into public\.event_ropings\s*\([^)]*)\msource_template_id\M',
      '\1roping_template_id', 'gi');
    body := regexp_replace(body,
      '(insert into public\.event_fees\s*\([^)]*)\msource_template_id\M',
      '\1roping_template_fee_id', 'gi');
    if body is distinct from routine.prosrc then
      definition := pg_get_functiondef(routine.oid);
      definition := replace(definition, routine.prosrc, body);
      execute definition;
    end if;
  end loop;
end;
$migration$;

-- RESTRICT deliberately fails if any actual database object still depends on
-- an alias. Never cascade into policies, reports, or application functions.
do $migration$
declare
  item record;
begin
  for item in select * from domain_table_names loop
    execute format('drop view public.%I restrict', item.old_name);
  end loop;
end;
$migration$;

notify pgrst, 'reload schema';

