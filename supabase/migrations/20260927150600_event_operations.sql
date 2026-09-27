create or replace function public.create_event_entry(
  target_roping_division_id uuid,
  target_person_id uuid,
  entry_origin public.entry_source default 'office',
  initial_payment_status public.payment_status default 'unpaid'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  division_record public.roping_divisions%rowtype;
  selected_membership_id uuid;
  existing_entry_count integer;
  new_entry_id uuid;
  fee_record public.roping_fees%rowtype;
  run_index integer;
begin
  select * into division_record
  from public.roping_divisions
  where id = target_roping_division_id;

  if division_record.id is null or not public.can_manage_organization(division_record.organization_id) then
    raise exception 'You do not have permission to add entries to this division';
  end if;

  select id into selected_membership_id
  from public.organization_memberships
  where organization_id = division_record.organization_id
    and person_id = target_person_id
    and status = 'active'
  limit 1;

  if selected_membership_id is null and not division_record.allow_guests then
    raise exception 'This division requires an active membership';
  end if;

  select count(*) into existing_entry_count
  from public.entries
  where roping_division_id = target_roping_division_id
    and person_id = target_person_id;

  if division_record.maximum_entries_per_person is not null
    and existing_entry_count >= division_record.maximum_entries_per_person then
    raise exception 'This contestant has reached the entry limit for this division';
  end if;

  insert into public.entries (
    organization_id,
    roping_id,
    roping_division_id,
    person_id,
    membership_id,
    entry_number,
    source,
    payment_status
  )
  values (
    division_record.organization_id,
    division_record.roping_id,
    division_record.id,
    target_person_id,
    selected_membership_id,
    existing_entry_count + 1,
    entry_origin,
    initial_payment_status
  )
  returning id into new_entry_id;

  for fee_record in
    select * from public.roping_fees
    where roping_id = division_record.roping_id
      and (roping_division_id = division_record.id or roping_division_id is null)
      and is_required = true
    order by sort_order, created_at
  loop
    if fee_record.scope = 'entry' then
      insert into public.entry_charges (
        organization_id, roping_id, person_id, entry_id, roping_fee_id, title, amount_cents
      ) values (
        division_record.organization_id, division_record.roping_id, target_person_id, new_entry_id, fee_record.id, fee_record.title, fee_record.amount_cents
      );
    elsif not exists (
      select 1 from public.entry_charges charge
      join public.roping_fees charged_fee on charged_fee.id = charge.roping_fee_id
      where charge.roping_id = division_record.roping_id
        and charge.person_id = target_person_id
        and (
          charge.roping_fee_id = fee_record.id
          or (
            fee_record.scope = 'contestant_event'
            and fee_record.source_template_id is not null
            and charged_fee.source_template_id = fee_record.source_template_id
          )
        )
    ) then
      insert into public.entry_charges (
        organization_id, roping_id, person_id, entry_id, roping_fee_id, title, amount_cents
      ) values (
        division_record.organization_id, division_record.roping_id, target_person_id, null, fee_record.id, fee_record.title, fee_record.amount_cents
      );
    end if;
  end loop;

  for run_index in 1..division_record.number_of_runs loop
    insert into public.runs (organization_id, roping_division_id, entry_id, run_number)
    values (division_record.organization_id, division_record.id, new_entry_id, run_index);
  end loop;

  return new_entry_id;
end;
$$;

create or replace function public.generate_division_draw(
  target_roping_division_id uuid,
  target_run_number integer default 1
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
  drawn_count integer;
begin
  select organization_id into target_organization_id
  from public.roping_divisions
  where id = target_roping_division_id;

  if target_organization_id is null or not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to generate this draw';
  end if;

  update public.runs
  set draw_position = null
  where roping_division_id = target_roping_division_id
    and run_number = target_run_number
    and status = 'pending';

  with randomized as (
    select id, row_number() over (order by random())::integer as position
    from public.runs
    where roping_division_id = target_roping_division_id
      and run_number = target_run_number
      and status = 'pending'
  )
  update public.runs run
  set draw_position = randomized.position
  from randomized
  where run.id = randomized.id;

  get diagnostics drawn_count = row_count;
  return drawn_count;
end;
$$;

create or replace function public.record_run_result(
  target_run_id uuid,
  entered_raw_time numeric,
  entered_penalty numeric,
  entered_status public.run_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
begin
  select organization_id into target_organization_id from public.runs where id = target_run_id;
  if target_organization_id is null or not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to record this run';
  end if;
  if entered_status = 'complete' and entered_raw_time is null then
    raise exception 'A completed run requires a time';
  end if;

  update public.runs
  set
    raw_time_seconds = case when entered_status = 'complete' then entered_raw_time else null end,
    penalty_seconds = case when entered_status = 'complete' then coalesce(entered_penalty, 0) else 0 end,
    status = entered_status,
    recorded_by = auth.uid(),
    recorded_at = now()
  where id = target_run_id;
end;
$$;

create or replace function public.set_roping_in_progress(target_roping_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
begin
  select organization_id into target_organization_id from public.ropings where id = target_roping_id;
  if target_organization_id is null or not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to start this event';
  end if;
  update public.ropings set status = 'in_progress', result_status = 'unofficial' where id = target_roping_id;
end;
$$;

create or replace function public.finalize_roping_results(target_roping_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_organization_id uuid;
begin
  select organization_id into target_organization_id from public.ropings where id = target_roping_id;
  if target_organization_id is null or not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to finalize this event';
  end if;
  if exists (
    select 1 from public.runs run
    join public.roping_divisions division on division.id = run.roping_division_id
    where division.roping_id = target_roping_id and run.status = 'pending'
  ) then
    raise exception 'Every scheduled run must be completed, scratched, or marked no-time before finalizing';
  end if;
  update public.roping_divisions set result_status = 'official' where roping_id = target_roping_id;
  update public.ropings set status = 'completed', result_status = 'official' where id = target_roping_id;
end;
$$;

grant execute on function public.create_event_entry(uuid, uuid, public.entry_source, public.payment_status) to authenticated;
grant execute on function public.generate_division_draw(uuid, integer) to authenticated;
grant execute on function public.record_run_result(uuid, numeric, numeric, public.run_status) to authenticated;
grant execute on function public.set_roping_in_progress(uuid) to authenticated;
grant execute on function public.finalize_roping_results(uuid) to authenticated;
