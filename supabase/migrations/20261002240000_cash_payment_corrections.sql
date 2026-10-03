alter table public.event_payments
  add column voided_by_label text;

create function public.void_event_cash_payment(
  target_payment_id uuid,
  correction_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  payment_record public.event_payments%rowtype;
  amount_due bigint;
  amount_paid bigint;
begin
  if length(trim(coalesce(correction_reason, ''))) < 5 then
    raise exception 'Enter a brief correction reason';
  end if;

  select * into payment_record
  from public.event_payments
  where id = target_payment_id
  for update;

  if payment_record.id is null
    or not public.can_manage_organization(payment_record.organization_id) then
    raise exception 'You do not have permission to correct this payment';
  end if;
  if payment_record.voided_at is not null then
    raise exception 'This payment has already been voided';
  end if;

  update public.event_payments
  set voided_at = now(),
      voided_by = auth.uid(),
      voided_by_label = coalesce(auth.jwt() ->> 'email', 'Unknown staff user'),
      void_reason = trim(correction_reason)
  where id = target_payment_id;

  select coalesce(sum(charge.amount_cents), 0) into amount_due
  from public.entry_charges charge
  left join public.entries entry on entry.id = charge.entry_id
  where charge.roping_id = payment_record.roping_id
    and charge.person_id = payment_record.person_id
    and charge.waived_at is null
    and (
      (charge.entry_id is not null
        and entry.competition_status = 'active'
        and entry.payment_status not in ('comped', 'refunded'))
      or (charge.entry_id is null and exists (
        select 1 from public.entries active_entry
        where active_entry.roping_id = payment_record.roping_id
          and active_entry.person_id = payment_record.person_id
          and active_entry.competition_status = 'active'
          and active_entry.payment_status not in ('comped', 'refunded')
      ))
    );

  select coalesce(sum(amount_cents), 0) into amount_paid
  from public.event_payments
  where roping_id = payment_record.roping_id
    and person_id = payment_record.person_id
    and voided_at is null;

  if amount_paid < amount_due then
    update public.entries
    set payment_status = 'unpaid'
    where roping_id = payment_record.roping_id
      and person_id = payment_record.person_id
      and competition_status = 'active'
      and payment_status = 'paid_cash';
  end if;
end;
$$;

revoke all on function public.void_event_cash_payment(uuid, text) from public;
grant execute on function public.void_event_cash_payment(uuid, text) to authenticated;
