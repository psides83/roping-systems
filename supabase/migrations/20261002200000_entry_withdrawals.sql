create type public.entry_competition_status as enum ('active', 'withdrawn');

alter table public.entries
  add column competition_status public.entry_competition_status not null default 'active';

create table public.entry_withdrawals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null references public.ropings(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  reason text not null check (length(trim(reason)) >= 5),
  financial_action text not null check (financial_action in ('keep_charges', 'waive_charges', 'refund')),
  prior_payment_status public.payment_status not null,
  archived_runs jsonb not null default '[]'::jsonb,
  affected_charge_ids uuid[] not null default '{}',
  withdrawn_by uuid references auth.users(id) on delete set null,
  withdrawn_at timestamptz not null default now(),
  reinstatement_reason text,
  reinstated_by uuid references auth.users(id) on delete set null,
  reinstated_at timestamptz,
  check (
    (reinstated_at is null and reinstatement_reason is null)
    or (reinstated_at is not null and length(trim(reinstatement_reason)) >= 5)
  )
);

create unique index one_active_withdrawal_per_entry
on public.entry_withdrawals (entry_id)
where reinstated_at is null;

create index entry_withdrawals_roping_created_idx
on public.entry_withdrawals (roping_id, withdrawn_at desc);

alter table public.entry_withdrawals enable row level security;

create policy "Producer users can read entry withdrawals"
on public.entry_withdrawals for select
using (public.has_organization_access(organization_id));

create trigger audit_entry_withdrawals
after insert or update or delete on public.entry_withdrawals
for each row execute function public.write_audit_log();

create function public.withdraw_event_entry(
  target_entry_id uuid,
  withdrawal_reason text,
  selected_financial_action text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_record public.entries%rowtype;
  event_status public.roping_status;
  clean_reason text := trim(withdrawal_reason);
  run_snapshot jsonb;
  charge_ids uuid[] := array[]::uuid[];
  withdrawal_id uuid;
begin
  if length(clean_reason) < 5 then
    raise exception 'Enter a brief reason for withdrawing this entry';
  end if;
  if selected_financial_action not in ('keep_charges', 'waive_charges', 'refund') then
    raise exception 'Choose how to handle this entry''s charges';
  end if;

  select * into entry_record from public.entries where id = target_entry_id for update;
  if entry_record.id is null
    or not public.can_manage_organization(entry_record.organization_id) then
    raise exception 'You do not have permission to withdraw this entry';
  end if;
  if entry_record.competition_status = 'withdrawn' then
    raise exception 'This entry is already withdrawn';
  end if;

  select status into event_status from public.ropings where id = entry_record.roping_id;
  if event_status in ('completed', 'cancelled') then
    raise exception 'Entries cannot be withdrawn after the event is completed or cancelled';
  end if;

  select coalesce(jsonb_agg(to_jsonb(run_record) order by run_record.run_number), '[]'::jsonb)
    into run_snapshot
  from public.runs run_record
  where run_record.entry_id = entry_record.id
    and run_record.status in ('pending', 'rerun');

  if selected_financial_action = 'waive_charges' then
    select coalesce(array_agg(id), array[]::uuid[]) into charge_ids
    from public.entry_charges
    where entry_id = entry_record.id and waived_at is null;
  end if;

  insert into public.entry_withdrawals (
    organization_id, roping_id, entry_id, reason, financial_action,
    prior_payment_status, archived_runs, affected_charge_ids, withdrawn_by
  ) values (
    entry_record.organization_id, entry_record.roping_id, entry_record.id,
    clean_reason, selected_financial_action, entry_record.payment_status,
    run_snapshot, charge_ids, auth.uid()
  ) returning id into withdrawal_id;

  delete from public.runs
  where entry_id = entry_record.id and status in ('pending', 'rerun');

  if selected_financial_action = 'waive_charges' then
    update public.entry_charges
    set waived_at = now(), waived_by = auth.uid(),
        waiver_reason = 'Entry withdrawn: ' || clean_reason
    where id = any(charge_ids);
  end if;

  update public.entries
  set competition_status = 'withdrawn',
      payment_status = case
        when selected_financial_action = 'refund' then 'refunded'::public.payment_status
        when selected_financial_action = 'waive_charges' then 'unpaid'::public.payment_status
        else payment_status
      end
  where id = entry_record.id;

  return withdrawal_id;
end;
$$;

create function public.reinstate_event_entry(target_entry_id uuid, reinstatement_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_record public.entries%rowtype;
  division_record public.roping_divisions%rowtype;
  event_status public.roping_status;
  withdrawal_record public.entry_withdrawals%rowtype;
  clean_reason text := trim(reinstatement_reason);
  archived_run jsonb;
  restored_draw_position integer;
begin
  if length(clean_reason) < 5 then
    raise exception 'Enter a brief reason for reinstating this entry';
  end if;

  select * into entry_record from public.entries where id = target_entry_id for update;
  if entry_record.id is null
    or not public.can_manage_organization(entry_record.organization_id) then
    raise exception 'You do not have permission to reinstate this entry';
  end if;
  if entry_record.competition_status <> 'withdrawn' then
    raise exception 'This entry is not withdrawn';
  end if;

  select * into division_record from public.roping_divisions
  where id = entry_record.roping_division_id;
  select status into event_status from public.ropings where id = entry_record.roping_id;

  if event_status in ('completed', 'cancelled') then
    raise exception 'Entries cannot be reinstated after the event is completed or cancelled';
  end if;
  if division_record.short_round_seeded_at is not null then
    raise exception 'This entry cannot be reinstated after the short round field is built';
  end if;

  select * into withdrawal_record from public.entry_withdrawals
  where entry_id = entry_record.id and reinstated_at is null
  order by withdrawn_at desc limit 1 for update;
  if withdrawal_record.id is null then
    raise exception 'The withdrawal record is unavailable';
  end if;

  for archived_run in
    select value from jsonb_array_elements(withdrawal_record.archived_runs)
  loop
    restored_draw_position := (archived_run ->> 'draw_position')::integer;
    if restored_draw_position is not null and exists (
      select 1 from public.runs
      where roping_division_id = entry_record.roping_division_id
        and run_number = (archived_run ->> 'run_number')::integer
        and draw_position = restored_draw_position
    ) then
      restored_draw_position := null;
    end if;

    insert into public.runs (
      organization_id, roping_division_id, entry_id, run_number,
      draw_position, status, note, cattle_id, rerun_count
    ) values (
      entry_record.organization_id, entry_record.roping_division_id,
      entry_record.id, (archived_run ->> 'run_number')::integer,
      restored_draw_position, (archived_run ->> 'status')::public.run_status,
      archived_run ->> 'note', (archived_run ->> 'cattle_id')::uuid,
      coalesce((archived_run ->> 'rerun_count')::integer, 0)
    );
  end loop;

  if withdrawal_record.financial_action = 'waive_charges' then
    update public.entry_charges
    set waived_at = null, waived_by = null, waiver_reason = null
    where id = any(withdrawal_record.affected_charge_ids);
  end if;

  update public.entries
  set competition_status = 'active', payment_status = withdrawal_record.prior_payment_status
  where id = entry_record.id;

  update public.entry_withdrawals
  set reinstatement_reason = clean_reason, reinstated_by = auth.uid(), reinstated_at = now()
  where id = withdrawal_record.id;
end;
$$;

revoke all on function public.withdraw_event_entry(uuid, text, text) from public;
grant execute on function public.withdraw_event_entry(uuid, text, text) to authenticated;
revoke all on function public.reinstate_event_entry(uuid, text) from public;
grant execute on function public.reinstate_event_entry(uuid, text) to authenticated;

create function public.prevent_withdrawn_entry_transfer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.competition_status = 'withdrawn' then
    raise exception 'Reinstate this entry before moving it to another class';
  end if;
  return new;
end;
$$;

create trigger entries_block_withdrawn_transfer
before update of roping_division_id on public.entries
for each row execute function public.prevent_withdrawn_entry_transfer();

create or replace function public.set_contestant_event_payment_status(
  target_roping_id uuid,
  target_person_id uuid,
  new_payment_status public.payment_status
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  updated_count integer;
begin
  select organization_id into target_organization_id
  from public.ropings
  where id = target_roping_id;

  if target_organization_id is null
    or not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to update payments for this event';
  end if;

  if not exists (
    select 1 from public.entries
    where roping_id = target_roping_id
      and person_id = target_person_id
      and organization_id = target_organization_id
      and competition_status = 'active'
  ) then
    raise exception 'That contestant does not have active entries in this event';
  end if;

  update public.entries
  set payment_status = new_payment_status
  where roping_id = target_roping_id
    and person_id = target_person_id
    and organization_id = target_organization_id
    and competition_status = 'active';

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace view public.public_aggregate_results
with (security_invoker = false)
as
select
  entry.id as result_id, roping.organization_id, organization.slug as organization_slug,
  roping.slug as roping_slug, roping.title as roping_title,
  division.id as division_id, division.name as division_name, division.result_status,
  entry.entry_number, person.first_name, person.last_name,
  division.number_of_runs as main_round_count,
  main_results.completed_count as main_rounds_completed,
  case when main_results.disqualified then null else main_results.aggregate_time_seconds end
    as main_aggregate_seconds,
  (short_run.id is not null) as is_short_round_qualifier,
  short_run.status as short_round_status,
  case when short_run.status = 'complete' then greatest(
    short_run.raw_time_seconds + short_run.penalty_seconds - entry.incentive_adjustment_seconds, 0
  ) else null end as short_round_time_seconds,
  case
    when main_results.disqualified then null
    when short_run.status = 'complete' then main_results.aggregate_time_seconds + greatest(
      short_run.raw_time_seconds + short_run.penalty_seconds - entry.incentive_adjustment_seconds, 0
    )
    else main_results.aggregate_time_seconds
  end as aggregate_time_seconds,
  case
    when main_results.disqualified then 'no_time'
    when short_run.status in ('no_time', 'scratch') then short_run.status::text
    when main_results.completed_count = division.number_of_runs then 'complete'
    else 'pending'
  end as status,
  entry.incentive_adjustment_seconds
from public.entries entry
join public.people person on person.id = entry.person_id
join public.roping_divisions division on division.id = entry.roping_division_id
join public.ropings roping on roping.id = division.roping_id
join public.organizations organization on organization.id = roping.organization_id
cross join lateral (
  select
    count(*) filter (where run.status = 'complete')::integer as completed_count,
    bool_or(run.status in ('no_time', 'scratch')) as disqualified,
    sum(greatest(
      run.raw_time_seconds + run.penalty_seconds - entry.incentive_adjustment_seconds, 0
    )) filter (where run.status = 'complete') as aggregate_time_seconds,
    count(*) filter (where run.status <> 'pending')::integer as started_count
  from public.runs run
  where run.entry_id = entry.id and run.run_number <= division.number_of_runs
) main_results
left join public.runs short_run
  on short_run.entry_id = entry.id
 and short_run.run_number = division.number_of_runs + 1
where roping.is_public = true
  and entry.competition_status = 'active'
  and main_results.started_count > 0;

grant select on public.public_aggregate_results to anon, authenticated;
