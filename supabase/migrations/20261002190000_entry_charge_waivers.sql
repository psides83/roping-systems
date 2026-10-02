alter table public.entry_charges
  add column waived_by uuid references auth.users(id) on delete set null;

create table public.entry_charge_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null references public.ropings(id) on delete cascade,
  entry_charge_id uuid not null references public.entry_charges(id) on delete cascade,
  action text not null check (action in ('waived', 'restored')),
  reason text not null check (length(trim(reason)) >= 5),
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index entry_charge_adjustments_charge_created_idx
on public.entry_charge_adjustments (entry_charge_id, created_at desc);

alter table public.entry_charge_adjustments enable row level security;

create policy "Producer users can read entry charge adjustments"
on public.entry_charge_adjustments for select
using (public.has_organization_access(organization_id));

create trigger audit_entry_charge_adjustments
after insert or update or delete on public.entry_charge_adjustments
for each row execute function public.write_audit_log();

create or replace function public.set_entry_charge_waiver(
  target_charge_id uuid,
  should_waive boolean,
  adjustment_reason text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge_record public.entry_charges%rowtype;
  clean_reason text := trim(adjustment_reason);
begin
  if length(clean_reason) < 5 then
    raise exception 'Enter a brief reason for this fee correction';
  end if;

  select * into charge_record
  from public.entry_charges
  where id = target_charge_id
  for update;

  if charge_record.id is null
    or not public.can_manage_organization(charge_record.organization_id)
  then
    raise exception 'You do not have permission to update this charge';
  end if;

  if should_waive and charge_record.waived_at is not null then
    raise exception 'This charge is already waived';
  end if;
  if not should_waive and charge_record.waived_at is null then
    raise exception 'This charge is not waived';
  end if;

  insert into public.entry_charge_adjustments (
    organization_id,
    roping_id,
    entry_charge_id,
    action,
    reason,
    changed_by
  ) values (
    charge_record.organization_id,
    charge_record.roping_id,
    charge_record.id,
    case when should_waive then 'waived' else 'restored' end,
    clean_reason,
    auth.uid()
  );

  update public.entry_charges
  set waived_at = case when should_waive then now() else null end,
      waived_by = case when should_waive then auth.uid() else null end,
      waiver_reason = case when should_waive then clean_reason else null end
  where id = charge_record.id;

  return should_waive;
end;
$$;

revoke all on function public.set_entry_charge_waiver(uuid, boolean, text) from public;
grant execute on function public.set_entry_charge_waiver(uuid, boolean, text) to authenticated;
