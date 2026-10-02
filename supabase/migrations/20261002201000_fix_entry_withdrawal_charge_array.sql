create or replace function public.withdraw_event_entry(
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
