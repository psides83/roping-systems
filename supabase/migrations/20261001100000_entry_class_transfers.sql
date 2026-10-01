create table public.entry_transfers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null,
  entry_id uuid not null,
  source_division_id uuid not null,
  destination_division_id uuid not null,
  source_entry_number integer not null check (source_entry_number > 0),
  destination_entry_number integer not null check (destination_entry_number > 0),
  reason text not null check (length(trim(reason)) > 0),
  archived_runs jsonb not null default '[]'::jsonb,
  moved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (roping_id, organization_id)
    references public.ropings(id, organization_id) on delete cascade,
  foreign key (entry_id, organization_id)
    references public.entries(id, organization_id) on delete cascade,
  foreign key (source_division_id, organization_id)
    references public.roping_divisions(id, organization_id),
  foreign key (destination_division_id, organization_id)
    references public.roping_divisions(id, organization_id),
  check (source_division_id <> destination_division_id)
);

create index entry_transfers_entry_created_idx
on public.entry_transfers (entry_id, created_at desc);

alter table public.entry_transfers enable row level security;

create policy "Organization users can read entry transfers"
on public.entry_transfers for select
using (public.has_organization_access(organization_id));

create policy "Organization managers can insert entry transfers"
on public.entry_transfers for insert
with check (public.can_manage_organization(organization_id));

create trigger audit_entry_transfers
after insert or update or delete on public.entry_transfers
for each row execute function public.write_audit_log();

create or replace function public.transfer_event_entry(
  target_entry_id uuid,
  target_division_id uuid,
  transfer_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  entry_record public.entries%rowtype;
  source_division public.roping_divisions%rowtype;
  destination_division public.roping_divisions%rowtype;
  destination_entry_number integer;
  destination_entry_count integer;
  selected_classification_id uuid;
  selected_adjustment numeric(8, 3) := 0;
  archived_run_data jsonb;
  charge_record record;
  destination_fee public.roping_fees%rowtype;
  destination_required_fee public.roping_fees%rowtype;
  run_index integer;
  next_draw_position integer;
  transfer_id uuid;
begin
  if nullif(trim(transfer_reason), '') is null then
    raise exception 'Enter a reason for moving this entry';
  end if;

  select * into entry_record
  from public.entries
  where id = target_entry_id
  for update;

  if entry_record.id is null
    or not public.can_manage_organization(entry_record.organization_id) then
    raise exception 'You do not have permission to move this entry';
  end if;

  select * into source_division
  from public.roping_divisions
  where id = entry_record.roping_division_id;

  select * into destination_division
  from public.roping_divisions
  where id = target_division_id
    and organization_id = entry_record.organization_id
    and roping_id = entry_record.roping_id;

  if destination_division.id is null then
    raise exception 'The destination class is unavailable';
  end if;
  if destination_division.id = source_division.id then
    raise exception 'Choose a different destination class';
  end if;
  if source_division.short_round_seeded_at is not null
    or destination_division.short_round_seeded_at is not null then
    raise exception 'Entries cannot be moved after a short round field has been set';
  end if;
  if entry_record.membership_id is null and not destination_division.allow_guests then
    raise exception 'The destination class does not allow guest entries';
  end if;

  select count(*) into destination_entry_count
  from public.entries
  where roping_division_id = destination_division.id
    and person_id = entry_record.person_id;

  if destination_division.maximum_entries_per_person is not null
    and destination_entry_count >= destination_division.maximum_entries_per_person then
    raise exception 'This contestant has reached the entry limit for the destination class';
  end if;

  destination_entry_number := destination_entry_count + 1;

  if entry_record.membership_id is not null and destination_division.incentive_enabled then
    select rule.classification_id, rule.adjustment_seconds
      into selected_classification_id, selected_adjustment
    from public.roping_incentive_rules rule
    join public.member_classifications member_classification
      on member_classification.classification_id = rule.classification_id
     and member_classification.membership_id = entry_record.membership_id
     and member_classification.ended_on is null
     and member_classification.effective_on <= current_date
    where rule.roping_division_id = destination_division.id
    order by rule.adjustment_seconds desc
    limit 1;
  end if;

  select coalesce(
    jsonb_agg(
      to_jsonb(run_record)
      || jsonb_build_object(
        'timer_readings',
        coalesce(
          (
            select jsonb_agg(to_jsonb(timer_record) order by timer_record.timer_number)
            from public.run_timer_readings timer_record
            where timer_record.run_id = run_record.id
          ),
          '[]'::jsonb
        )
      )
      order by run_record.run_number
    ),
    '[]'::jsonb
  ) into archived_run_data
  from public.runs run_record
  where run_record.entry_id = entry_record.id;

  for charge_record in
    select charge.*, fee.source_template_id, fee.kind, fee.scope
    from public.entry_charges charge
    join public.roping_fees fee on fee.id = charge.roping_fee_id
    where charge.entry_id = entry_record.id
  loop
    select target_fee.* into destination_fee
    from public.roping_fees target_fee
    where target_fee.roping_division_id = destination_division.id
      and target_fee.scope = charge_record.scope
      and (
        (
          charge_record.source_template_id is not null
          and target_fee.source_template_id = charge_record.source_template_id
        )
        or (
          target_fee.kind = charge_record.kind
          and lower(target_fee.title) = lower(charge_record.title)
          and target_fee.amount_cents = charge_record.amount_cents
        )
      )
    order by
      (target_fee.source_template_id = charge_record.source_template_id) desc nulls last,
      target_fee.sort_order,
      target_fee.created_at
    limit 1;

    if destination_fee.id is null then
      raise exception 'The destination class is missing a matching fee for "%"', charge_record.title;
    end if;

    update public.entry_charges
    set roping_fee_id = destination_fee.id,
        title = destination_fee.title,
        amount_cents = destination_fee.amount_cents
    where id = charge_record.id;
  end loop;

  for destination_required_fee in
    select *
    from public.roping_fees
    where roping_division_id = destination_division.id
      and scope = 'entry'
      and is_required = true
    order by sort_order, created_at
  loop
    if not exists (
      select 1 from public.entry_charges
      where entry_id = entry_record.id
        and roping_fee_id = destination_required_fee.id
    ) then
      insert into public.entry_charges (
        organization_id, roping_id, person_id, entry_id, roping_fee_id, title, amount_cents
      ) values (
        entry_record.organization_id,
        entry_record.roping_id,
        entry_record.person_id,
        entry_record.id,
        destination_required_fee.id,
        destination_required_fee.title,
        destination_required_fee.amount_cents
      );
    end if;
  end loop;

  insert into public.entry_transfers (
    organization_id,
    roping_id,
    entry_id,
    source_division_id,
    destination_division_id,
    source_entry_number,
    destination_entry_number,
    reason,
    archived_runs,
    moved_by
  ) values (
    entry_record.organization_id,
    entry_record.roping_id,
    entry_record.id,
    source_division.id,
    destination_division.id,
    entry_record.entry_number,
    destination_entry_number,
    trim(transfer_reason),
    archived_run_data,
    auth.uid()
  ) returning id into transfer_id;

  delete from public.runs where entry_id = entry_record.id;

  update public.entries
  set roping_division_id = destination_division.id,
      entry_number = destination_entry_number,
      incentive_classification_id = selected_classification_id,
      incentive_adjustment_seconds = coalesce(selected_adjustment, 0)
  where id = entry_record.id;

  for run_index in 1..destination_division.number_of_runs loop
    select case when max(draw_position) is null then null else max(draw_position) + 1 end
      into next_draw_position
    from public.runs
    where roping_division_id = destination_division.id
      and run_number = run_index;

    insert into public.runs (
      organization_id,
      roping_division_id,
      entry_id,
      run_number,
      draw_position
    ) values (
      entry_record.organization_id,
      destination_division.id,
      entry_record.id,
      run_index,
      next_draw_position
    );
  end loop;

  return transfer_id;
end;
$$;

grant execute on function public.transfer_event_entry(uuid, uuid, text) to authenticated;
