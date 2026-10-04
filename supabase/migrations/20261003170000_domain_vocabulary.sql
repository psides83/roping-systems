-- Align the physical schema with the language used by producers and ropers.
-- Legacy views at the end keep the existing stored procedures operational
-- while application queries move to the canonical names immediately.

alter table public.organizations rename to producers;
alter table public.organization_users rename to producer_staff;
alter table public.organization_memberships rename to memberships;
alter table public.people rename to ropers;
alter table public.audit_log rename to producer_audit_log;
alter table public.skill_levels rename to legacy_skill_levels;

alter table public.disciplines rename to divisions;
alter table public.member_classifications rename to membership_classification_history;
alter table public.classification_watch_events rename to classification_review_events;
alter table public.classification_reviews rename to membership_classification_reviews;

alter table public.division_templates rename to roping_templates;
alter table public.fee_templates rename to roping_template_fees;

alter table public.ropings rename to events;
alter table public.roping_divisions rename to event_ropings;
alter table public.roping_fees rename to event_fees;
alter table public.roping_incentive_rules rename to event_roping_handicap_adjustments;
alter table public.roping_short_round_brackets rename to event_roping_short_round_brackets;
alter table public.roping_rounds rename to event_roping_rounds;

alter table public.entries rename to roping_entries;
alter table public.entry_transfers rename to entry_roping_transfers;
alter table public.event_contestant_check_ins rename to event_check_ins;
alter table public.runs rename to competition_runs;

alter table public.roping_payout_plans rename to event_roping_payout_plans;
alter table public.roping_payout_brackets rename to event_roping_payout_brackets;
alter table public.roping_payout_places rename to event_roping_payout_places;

alter table public.online_entry_requests rename to online_entry_submissions;
alter table public.online_entry_request_items rename to online_entry_submission_ropings;
alter table public.online_entry_request_options rename to online_entry_submission_fee_options;

do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('producers', 'allow_guest_entries', 'allow_non_member_entries'),
      ('producer_staff', 'organization_id', 'producer_id'),
      ('memberships', 'organization_id', 'producer_id'),
      ('memberships', 'person_id', 'roper_id'),
      ('producer_audit_log', 'organization_id', 'producer_id'),
      ('divisions', 'organization_id', 'producer_id'),
      ('divisions', 'watch_threshold', 'review_after_event_count'),
      ('membership_classification_history', 'organization_id', 'producer_id'),
      ('membership_classification_history', 'discipline_id', 'division_id'),
      ('classification_review_events', 'organization_id', 'producer_id'),
      ('classification_review_events', 'discipline_id', 'division_id'),
      ('membership_classification_reviews', 'organization_id', 'producer_id'),
      ('membership_classification_reviews', 'discipline_id', 'division_id'),
      ('roping_templates', 'organization_id', 'producer_id'),
      ('roping_templates', 'discipline_id', 'division_id'),
      ('roping_templates', 'number_of_runs', 'main_round_count'),
      ('roping_templates', 'maximum_entries_per_person', 'max_entries_per_roper'),
      ('roping_templates', 'allow_guests', 'allow_non_members'),
      ('roping_templates', 'minimum_runs_between_entries', 'minimum_positions_between_entries'),
      ('roping_template_fees', 'organization_id', 'producer_id'),
      ('roping_template_fees', 'division_template_id', 'roping_template_id'),
      ('events', 'organization_id', 'producer_id'),
      ('event_ropings', 'organization_id', 'producer_id'),
      ('event_ropings', 'roping_id', 'event_id'),
      ('event_ropings', 'source_template_id', 'roping_template_id'),
      ('event_ropings', 'discipline_id', 'division_id'),
      ('event_ropings', 'number_of_runs', 'main_round_count'),
      ('event_ropings', 'maximum_entries_per_person', 'max_entries_per_roper'),
      ('event_ropings', 'allow_guests', 'allow_non_members'),
      ('event_ropings', 'minimum_runs_between_entries', 'minimum_positions_between_entries'),
      ('event_fees', 'organization_id', 'producer_id'),
      ('event_fees', 'roping_id', 'event_id'),
      ('event_fees', 'roping_division_id', 'event_roping_id'),
      ('event_fees', 'source_template_id', 'roping_template_fee_id'),
      ('event_roping_handicap_adjustments', 'organization_id', 'producer_id'),
      ('event_roping_handicap_adjustments', 'roping_id', 'event_id'),
      ('event_roping_handicap_adjustments', 'roping_division_id', 'event_roping_id'),
      ('event_roping_handicap_adjustments', 'adjustment_seconds', 'handicap_time_credit_seconds'),
      ('event_roping_short_round_brackets', 'organization_id', 'producer_id'),
      ('event_roping_short_round_brackets', 'roping_id', 'event_id'),
      ('event_roping_short_round_brackets', 'roping_division_id', 'event_roping_id'),
      ('event_roping_rounds', 'organization_id', 'producer_id'),
      ('event_roping_rounds', 'roping_division_id', 'event_roping_id'),
      ('roping_entries', 'organization_id', 'producer_id'),
      ('roping_entries', 'roping_id', 'event_id'),
      ('roping_entries', 'roping_division_id', 'event_roping_id'),
      ('roping_entries', 'person_id', 'roper_id'),
      ('roping_entries', 'incentive_classification_id', 'handicap_classification_id'),
      ('roping_entries', 'incentive_adjustment_seconds', 'handicap_time_credit_seconds'),
      ('entry_roping_transfers', 'organization_id', 'producer_id'),
      ('entry_roping_transfers', 'roping_id', 'event_id'),
      ('entry_roping_transfers', 'source_division_id', 'source_event_roping_id'),
      ('entry_roping_transfers', 'destination_division_id', 'destination_event_roping_id'),
      ('event_check_ins', 'organization_id', 'producer_id'),
      ('event_check_ins', 'roping_id', 'event_id'),
      ('event_check_ins', 'person_id', 'roper_id'),
      ('competition_runs', 'organization_id', 'producer_id'),
      ('competition_runs', 'roping_division_id', 'event_roping_id'),
      ('competition_runs', 'run_number', 'round_number'),
      ('event_roping_payout_plans', 'organization_id', 'producer_id'),
      ('event_roping_payout_plans', 'roping_id', 'event_id'),
      ('event_roping_payout_plans', 'roping_division_id', 'event_roping_id'),
      ('event_roping_payout_plans', 'roping_fee_id', 'event_fee_id'),
      ('event_roping_payout_brackets', 'organization_id', 'producer_id'),
      ('event_roping_payout_places', 'organization_id', 'producer_id'),
      ('online_entry_submissions', 'organization_id', 'producer_id'),
      ('online_entry_submissions', 'roping_id', 'event_id'),
      ('online_entry_submissions', 'person_id', 'roper_id'),
      ('online_entry_submission_ropings', 'organization_id', 'producer_id'),
      ('online_entry_submission_ropings', 'request_id', 'submission_id'),
      ('online_entry_submission_ropings', 'roping_division_id', 'event_roping_id'),
      ('online_entry_submission_fee_options', 'organization_id', 'producer_id'),
      ('online_entry_submission_fee_options', 'request_id', 'submission_id'),
      ('online_entry_submission_fee_options', 'request_item_id', 'submission_roping_id'),
      ('online_entry_submission_fee_options', 'roping_fee_id', 'event_fee_id')
    ) as renames(table_name, old_name, new_name)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = item.table_name
        and column_name = item.old_name
    ) then
      execute format(
        'alter table public.%I rename column %I to %I',
        item.table_name, item.old_name, item.new_name
      );
    end if;
  end loop;
end;
$$;

update public.producer_audit_log audit
set entity_type = names.new_name
from (values
  ('organizations', 'producers'),
  ('organization_users', 'producer_staff'),
  ('organization_memberships', 'memberships'),
  ('people', 'ropers'),
  ('skill_levels', 'legacy_skill_levels'),
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
  ('online_entry_request_options', 'online_entry_submission_fee_options')
) as names(old_name, new_name)
where audit.entity_type = names.old_name;

alter view public.public_organization_pages rename to public_producer_pages;
alter view public.organization_team_directory rename to producer_staff_directory;
alter view public.organization_audit_history rename to producer_audit_history;
alter view public.public_roping_schedule rename to public_event_schedule;
alter view public.public_live_results rename to public_event_live_results;

do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('public_producer_pages', 'organization_id', 'producer_id'),
      ('public_producer_pages', 'organization_name', 'producer_name'),
      ('producer_staff_directory', 'organization_id', 'producer_id'),
      ('producer_audit_history', 'organization_id', 'producer_id'),
      ('public_event_schedule', 'organization_id', 'producer_id'),
      ('public_event_schedule', 'organization_slug', 'producer_slug'),
      ('public_event_schedule', 'organization_name', 'producer_name'),
      ('public_event_schedule', 'roping_id', 'event_id'),
      ('public_event_entry_options', 'organization_id', 'producer_id'),
      ('public_event_entry_options', 'organization_slug', 'producer_slug'),
      ('public_event_entry_options', 'organization_name', 'producer_name'),
      ('public_event_entry_options', 'roping_id', 'event_id'),
      ('public_event_entry_options', 'roping_slug', 'event_slug'),
      ('public_event_entry_options', 'division_id', 'event_roping_id'),
      ('public_event_entry_options', 'division_name', 'event_roping_name'),
      ('public_event_entry_options', 'division_description', 'event_roping_description'),
      ('public_event_entry_options', 'division_starts_at', 'event_roping_starts_at'),
      ('public_event_entry_options', 'maximum_entries_per_person', 'max_entries_per_roper'),
      ('public_event_entry_options', 'allow_guests', 'allow_non_members'),
      ('public_event_optional_fees', 'organization_id', 'producer_id'),
      ('public_event_optional_fees', 'organization_slug', 'producer_slug'),
      ('public_event_optional_fees', 'roping_id', 'event_id'),
      ('public_event_optional_fees', 'roping_slug', 'event_slug'),
      ('public_event_optional_fees', 'roping_division_id', 'event_roping_id'),
      ('public_event_optional_fees', 'division_id', 'event_roping_id'),
      ('public_event_optional_fees', 'roping_fee_id', 'event_fee_id'),
      ('public_event_optional_fees', 'fee_id', 'event_fee_id'),
      ('public_event_live_results', 'organization_id', 'producer_id'),
      ('public_event_live_results', 'organization_slug', 'producer_slug'),
      ('public_event_live_results', 'roping_id', 'event_id'),
      ('public_event_live_results', 'roping_slug', 'event_slug'),
      ('public_event_live_results', 'roping_title', 'event_title'),
      ('public_event_live_results', 'division_id', 'event_roping_id'),
      ('public_event_live_results', 'division_name', 'event_roping_name'),
      ('public_event_live_results', 'run_number', 'round_number'),
      ('public_aggregate_results', 'organization_id', 'producer_id'),
      ('public_aggregate_results', 'organization_slug', 'producer_slug'),
      ('public_aggregate_results', 'roping_id', 'event_id'),
      ('public_aggregate_results', 'roping_slug', 'event_slug'),
      ('public_aggregate_results', 'roping_title', 'event_title'),
      ('public_aggregate_results', 'division_id', 'event_roping_id'),
      ('public_aggregate_results', 'division_name', 'event_roping_name'),
      ('public_aggregate_results', 'incentive_adjustment_seconds', 'handicap_time_credit_seconds'),
      ('public_competition_formats', 'organization_id', 'producer_id'),
      ('public_competition_formats', 'organization_slug', 'producer_slug'),
      ('public_competition_formats', 'roping_id', 'event_id'),
      ('public_competition_formats', 'roping_slug', 'event_slug'),
      ('public_competition_formats', 'division_id', 'event_roping_id'),
      ('public_competition_formats', 'division_name', 'event_roping_name'),
      ('public_membership_forms', 'organization_id', 'producer_id'),
      ('public_membership_forms', 'organization_slug', 'producer_slug'),
      ('public_membership_forms', 'organization_name', 'producer_name')
    ) as renames(view_name, old_name, new_name)
  loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = item.view_name
        and column_name = item.old_name
    ) then
      execute format(
        'alter view public.%I rename column %I to %I',
        item.view_name, item.old_name, item.new_name
      );
    end if;
  end loop;
end;
$$;

-- Build simple, automatically updatable compatibility views. Existing
-- security-definer procedures can continue using their original identifiers
-- while new application code uses the canonical schema above.
do $$
declare
  table_item record;
  select_list text;
begin
  create temporary table legacy_table_names (
    old_name text primary key,
    new_name text not null
  ) on commit drop;
  insert into legacy_table_names values
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

  create temporary table legacy_column_names (
    new_table text,
    new_name text,
    old_name text,
    primary key (new_table, new_name)
  ) on commit drop;
  insert into legacy_column_names
  select table_name, new_name, old_name
  from (values
    ('producers', 'allow_non_member_entries', 'allow_guest_entries'),
    ('divisions', 'review_after_event_count', 'watch_threshold'),
    ('roping_templates', 'division_id', 'discipline_id'),
    ('roping_templates', 'main_round_count', 'number_of_runs'),
    ('roping_templates', 'max_entries_per_roper', 'maximum_entries_per_person'),
    ('roping_templates', 'allow_non_members', 'allow_guests'),
    ('roping_templates', 'minimum_positions_between_entries', 'minimum_runs_between_entries'),
    ('roping_template_fees', 'roping_template_id', 'division_template_id'),
    ('event_ropings', 'event_id', 'roping_id'),
    ('event_ropings', 'roping_template_id', 'source_template_id'),
    ('event_ropings', 'division_id', 'discipline_id'),
    ('event_ropings', 'main_round_count', 'number_of_runs'),
    ('event_ropings', 'max_entries_per_roper', 'maximum_entries_per_person'),
    ('event_ropings', 'allow_non_members', 'allow_guests'),
    ('event_ropings', 'minimum_positions_between_entries', 'minimum_runs_between_entries'),
    ('event_fees', 'event_id', 'roping_id'),
    ('event_fees', 'event_roping_id', 'roping_division_id'),
    ('event_fees', 'roping_template_fee_id', 'source_template_id'),
    ('event_roping_handicap_adjustments', 'event_id', 'roping_id'),
    ('event_roping_handicap_adjustments', 'event_roping_id', 'roping_division_id'),
    ('event_roping_handicap_adjustments', 'handicap_time_credit_seconds', 'adjustment_seconds'),
    ('event_roping_short_round_brackets', 'event_id', 'roping_id'),
    ('event_roping_short_round_brackets', 'event_roping_id', 'roping_division_id'),
    ('event_roping_rounds', 'event_roping_id', 'roping_division_id'),
    ('roping_entries', 'event_id', 'roping_id'),
    ('roping_entries', 'event_roping_id', 'roping_division_id'),
    ('roping_entries', 'roper_id', 'person_id'),
    ('roping_entries', 'handicap_classification_id', 'incentive_classification_id'),
    ('roping_entries', 'handicap_time_credit_seconds', 'incentive_adjustment_seconds'),
    ('entry_roping_transfers', 'event_id', 'roping_id'),
    ('entry_roping_transfers', 'source_event_roping_id', 'source_division_id'),
    ('entry_roping_transfers', 'destination_event_roping_id', 'destination_division_id'),
    ('event_check_ins', 'event_id', 'roping_id'),
    ('event_check_ins', 'roper_id', 'person_id'),
    ('competition_runs', 'event_roping_id', 'roping_division_id'),
    ('competition_runs', 'round_number', 'run_number'),
    ('event_roping_payout_plans', 'event_id', 'roping_id'),
    ('event_roping_payout_plans', 'event_roping_id', 'roping_division_id'),
    ('event_roping_payout_plans', 'event_fee_id', 'roping_fee_id'),
    ('online_entry_submissions', 'event_id', 'roping_id'),
    ('online_entry_submissions', 'roper_id', 'person_id'),
    ('online_entry_submission_ropings', 'submission_id', 'request_id'),
    ('online_entry_submission_ropings', 'event_roping_id', 'roping_division_id'),
    ('online_entry_submission_fee_options', 'submission_id', 'request_id'),
    ('online_entry_submission_fee_options', 'submission_roping_id', 'request_item_id'),
    ('online_entry_submission_fee_options', 'event_fee_id', 'roping_fee_id')
  ) as columns(table_name, new_name, old_name);

  -- Producer scoping is shared by almost every renamed table.
  insert into legacy_column_names (new_table, new_name, old_name)
  select new_name, 'producer_id', 'organization_id'
  from legacy_table_names
  where exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = legacy_table_names.new_name
      and column_name = 'producer_id'
  )
  on conflict do nothing;

  insert into legacy_column_names values
    ('memberships', 'roper_id', 'person_id')
  on conflict do nothing;

  for table_item in select * from legacy_table_names order by old_name
  loop
    select string_agg(
      format('%I as %I', column_info.column_name,
        coalesce(column_map.old_name, column_info.column_name)),
      ', ' order by column_info.ordinal_position
    ) into select_list
    from information_schema.columns column_info
    left join legacy_column_names column_map
      on column_map.new_table = table_item.new_name
      and column_map.new_name = column_info.column_name
    where column_info.table_schema = 'public'
      and column_info.table_name = table_item.new_name;

    execute format(
      'create view public.%I with (security_invoker = true) as select %s from public.%I',
      table_item.old_name, select_list, table_item.new_name
    );
    execute format('revoke all on public.%I from anon, authenticated', table_item.old_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_item.old_name);
  end loop;
end;
$$;

comment on table public.producers is 'Roping producers that own memberships, templates, and events.';
comment on table public.ropers is 'Shared roper identities that may hold memberships with multiple producers.';
comment on table public.events is 'One-day or multi-day producer events containing scheduled ropings.';
comment on table public.event_ropings is 'Individual scheduled ropings within an event.';
comment on table public.roping_templates is 'Reusable division-specific formats used to add ropings to events.';
comment on table public.legacy_skill_levels is 'Deprecated pre-classification records retained for historical compatibility.';
