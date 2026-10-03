create table public.payout_disbursements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null,
  payout_plan_id uuid not null,
  entry_id uuid not null,
  award_key text not null,
  section_type text not null,
  round_number integer,
  d_number integer,
  place_number integer not null check (place_number > 0),
  contestant_name text not null,
  amount_cents integer not null check (amount_cents > 0),
  paid_by uuid references auth.users(id) on delete set null,
  paid_by_label text not null,
  paid_at timestamptz not null default now(),
  unique (payout_plan_id, award_key),
  foreign key (roping_id, organization_id)
    references public.ropings(id, organization_id) on delete cascade,
  foreign key (payout_plan_id, organization_id)
    references public.roping_payout_plans(id, organization_id) on delete cascade,
  foreign key (entry_id, organization_id)
    references public.entries(id, organization_id) on delete cascade
);

create index payout_disbursements_event_idx
on public.payout_disbursements (roping_id, paid_at desc);

alter table public.payout_disbursements enable row level security;

create policy "Producer users can read payout disbursements"
on public.payout_disbursements for select
using (public.has_organization_access(organization_id));

create trigger audit_payout_disbursements
after insert or update or delete on public.payout_disbursements
for each row execute function public.write_audit_log();

create function public.record_payout_disbursement(
  target_plan_id uuid,
  target_entry_id uuid,
  target_award_key text,
  target_section_type text,
  target_round_number integer,
  target_d_number integer,
  target_place_number integer,
  target_contestant_name text,
  target_amount_cents integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_record public.roping_payout_plans%rowtype;
  saved_id uuid;
begin
  select * into plan_record
  from public.roping_payout_plans
  where id = target_plan_id;

  if plan_record.id is null
    or not public.can_manage_organization(plan_record.organization_id) then
    raise exception 'You do not have permission to record this payout';
  end if;
  if target_amount_cents <= 0 or target_place_number <= 0 then
    raise exception 'The payout amount and place must be valid';
  end if;
  if nullif(trim(target_award_key), '') is null
    or length(target_award_key) > 300
    or nullif(trim(target_contestant_name), '') is null then
    raise exception 'The payout award is incomplete';
  end if;
  if not exists (
    select 1 from public.entries entry
    where entry.id = target_entry_id
      and entry.organization_id = plan_record.organization_id
      and entry.roping_id = plan_record.roping_id
      and entry.roping_division_id = plan_record.roping_division_id
  ) then
    raise exception 'The payout entry does not belong to this roping';
  end if;

  insert into public.payout_disbursements (
    organization_id, roping_id, payout_plan_id, entry_id, award_key,
    section_type, round_number, d_number, place_number, contestant_name,
    amount_cents, paid_by, paid_by_label
  ) values (
    plan_record.organization_id, plan_record.roping_id, plan_record.id,
    target_entry_id, trim(target_award_key), trim(target_section_type),
    target_round_number, target_d_number, target_place_number,
    trim(target_contestant_name), target_amount_cents, auth.uid(),
    coalesce(auth.jwt() ->> 'email', 'Unknown staff user')
  )
  on conflict (payout_plan_id, award_key) do update
  set amount_cents = excluded.amount_cents,
      place_number = excluded.place_number,
      contestant_name = excluded.contestant_name,
      paid_by = excluded.paid_by,
      paid_by_label = excluded.paid_by_label,
      paid_at = now()
  returning id into saved_id;

  return saved_id;
end;
$$;

create function public.remove_payout_disbursement(
  target_plan_id uuid,
  target_award_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_record public.roping_payout_plans%rowtype;
begin
  select * into plan_record
  from public.roping_payout_plans
  where id = target_plan_id;

  if plan_record.id is null
    or not public.can_manage_organization(plan_record.organization_id) then
    raise exception 'You do not have permission to change this payout';
  end if;

  delete from public.payout_disbursements
  where payout_plan_id = plan_record.id
    and award_key = target_award_key;
end;
$$;

revoke all on function public.record_payout_disbursement(
  uuid, uuid, text, text, integer, integer, integer, text, integer
) from public;
grant execute on function public.record_payout_disbursement(
  uuid, uuid, text, text, integer, integer, integer, text, integer
) to authenticated;

revoke all on function public.remove_payout_disbursement(uuid, text) from public;
grant execute on function public.remove_payout_disbursement(uuid, text) to authenticated;
