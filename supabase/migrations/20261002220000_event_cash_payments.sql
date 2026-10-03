create table public.event_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null,
  person_id uuid not null references public.people(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  payment_method text not null default 'cash' check (payment_method = 'cash'),
  note text,
  received_by uuid references auth.users(id) on delete set null,
  received_by_label text not null,
  received_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id) on delete set null,
  void_reason text,
  foreign key (roping_id, organization_id)
    references public.ropings(id, organization_id) on delete cascade,
  check (
    (voided_at is null and void_reason is null)
    or (voided_at is not null and length(trim(void_reason)) >= 5)
  )
);

create index event_payments_contestant_time_idx
on public.event_payments (roping_id, person_id, received_at desc);

alter table public.event_payments enable row level security;

create policy "Producer users can read event payments"
on public.event_payments for select
using (public.has_organization_access(organization_id));

create trigger audit_event_payments
after insert or update or delete on public.event_payments
for each row execute function public.write_audit_log();

create function public.record_event_cash_payment(
  target_roping_id uuid,
  target_person_id uuid,
  payment_amount_cents integer,
  payment_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_record public.ropings%rowtype;
  amount_due bigint;
  amount_paid bigint;
  remaining_balance bigint;
  payment_id uuid;
begin
  if payment_amount_cents <= 0 then
    raise exception 'Enter a payment amount greater than zero';
  end if;

  select * into event_record
  from public.ropings
  where id = target_roping_id;

  if event_record.id is null
    or not public.can_manage_organization(event_record.organization_id) then
    raise exception 'You do not have permission to record payments for this event';
  end if;
  if event_record.status in ('completed', 'cancelled') then
    raise exception 'Payments cannot be recorded after the event is completed or cancelled';
  end if;
  if not exists (
    select 1 from public.entries
    where roping_id = target_roping_id
      and person_id = target_person_id
      and competition_status = 'active'
      and payment_status not in ('comped', 'refunded')
  ) then
    raise exception 'This contestant does not have an active balance for the event';
  end if;

  select coalesce(sum(charge.amount_cents), 0) into amount_due
  from public.entry_charges charge
  left join public.entries entry on entry.id = charge.entry_id
  where charge.roping_id = target_roping_id
    and charge.person_id = target_person_id
    and charge.waived_at is null
    and (
      (
        charge.entry_id is not null
        and entry.competition_status = 'active'
        and entry.payment_status not in ('comped', 'refunded')
      )
      or (
        charge.entry_id is null
        and exists (
          select 1 from public.entries active_entry
          where active_entry.roping_id = target_roping_id
            and active_entry.person_id = target_person_id
            and active_entry.competition_status = 'active'
            and active_entry.payment_status not in ('comped', 'refunded')
        )
      )
    );

  select coalesce(sum(amount_cents), 0) into amount_paid
  from public.event_payments
  where roping_id = target_roping_id
    and person_id = target_person_id
    and voided_at is null;

  if amount_paid = 0 and not exists (
    select 1 from public.entries
    where roping_id = target_roping_id
      and person_id = target_person_id
      and competition_status = 'active'
      and payment_status = 'unpaid'
  ) then
    amount_paid := amount_due;
  end if;

  remaining_balance := greatest(amount_due - amount_paid, 0);
  if remaining_balance = 0 then
    raise exception 'This contestant is already marked paid';
  end if;
  if payment_amount_cents > remaining_balance then
    raise exception 'Payment exceeds the remaining balance';
  end if;

  insert into public.event_payments (
    organization_id, roping_id, person_id, amount_cents, note,
    received_by, received_by_label
  ) values (
    event_record.organization_id, event_record.id, target_person_id,
    payment_amount_cents, nullif(trim(payment_note), ''), auth.uid(),
    coalesce(auth.jwt() ->> 'email', 'Unknown staff user')
  ) returning id into payment_id;

  if amount_paid + payment_amount_cents >= amount_due then
    update public.entries
    set payment_status = 'paid_cash'
    where roping_id = target_roping_id
      and person_id = target_person_id
      and competition_status = 'active'
      and payment_status = 'unpaid';
  end if;

  return payment_id;
end;
$$;

revoke all on function public.record_event_cash_payment(uuid, uuid, integer, text)
from public;
grant execute on function public.record_event_cash_payment(uuid, uuid, integer, text)
to authenticated;
