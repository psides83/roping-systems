create or replace function public.has_organization_access(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_users
    where organization_id = target_organization_id and user_id = auth.uid()
  );
$$;

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.organization_users
    where organization_id = target_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin', 'operator')
  );
$$;

create or replace function public.create_organization(organization_name text, organization_slug text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into public.organizations (name, slug)
  values (organization_name, organization_slug)
  returning id into new_organization_id;

  insert into public.organization_users (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'owner');

  return new_organization_id;
end;
$$;

alter table public.people enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_users enable row level security;
alter table public.skill_levels enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.division_templates enable row level security;
alter table public.fee_templates enable row level security;
alter table public.ropings enable row level security;
alter table public.roping_divisions enable row level security;
alter table public.roping_fees enable row level security;
alter table public.entries enable row level security;
alter table public.entry_charges enable row level security;
alter table public.runs enable row level security;

create policy "Users can read their profile"
on public.people for select
using (auth_user_id = auth.uid());

create policy "Users can update their profile"
on public.people for update
using (auth_user_id = auth.uid())
with check (auth_user_id = auth.uid());

create policy "Organization staff can read related people"
on public.people for select
using (
  exists (
    select 1 from public.organization_memberships membership
    where membership.person_id = people.id
      and public.has_organization_access(membership.organization_id)
  )
  or exists (
    select 1 from public.entries entry
    where entry.person_id = people.id
      and public.has_organization_access(entry.organization_id)
  )
);

create policy "Organization staff can add people"
on public.people for insert
with check (auth.uid() is not null);

create policy "Users can read their organizations"
on public.organizations for select
using (public.has_organization_access(id));

create policy "Managers can update their organizations"
on public.organizations for update
using (public.can_manage_organization(id))
with check (public.can_manage_organization(id));

create policy "Users can read organization teams"
on public.organization_users for select
using (public.has_organization_access(organization_id));

create policy "Owners and admins can manage organization teams"
on public.organization_users for all
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'skill_levels',
    'organization_memberships',
    'division_templates',
    'fee_templates',
    'ropings',
    'roping_divisions',
    'roping_fees',
    'entries',
    'entry_charges',
    'runs'
  ]
  loop
    execute format(
      'create policy "Organization users can read %1$s" on public.%1$I for select using (public.has_organization_access(organization_id))',
      table_name
    );
    execute format(
      'create policy "Organization managers can insert %1$s" on public.%1$I for insert with check (public.can_manage_organization(organization_id))',
      table_name
    );
    execute format(
      'create policy "Organization managers can update %1$s" on public.%1$I for update using (public.can_manage_organization(organization_id)) with check (public.can_manage_organization(organization_id))',
      table_name
    );
    execute format(
      'create policy "Organization managers can delete %1$s" on public.%1$I for delete using (public.can_manage_organization(organization_id))',
      table_name
    );
  end loop;
end;
$$;

create view public.public_organization_pages
with (security_invoker = false)
as
select id, name, coalesce(public_name, name) as public_name, slug
from public.organizations;

create view public.public_roping_schedule
with (security_invoker = false)
as
select
  roping.id,
  roping.organization_id,
  organization.slug as organization_slug,
  roping.title,
  roping.slug,
  roping.venue_name,
  roping.address,
  roping.starts_at,
  roping.entries_open_at,
  roping.entries_close_at,
  roping.status,
  roping.result_status
from public.ropings roping
join public.organizations organization on organization.id = roping.organization_id
where roping.is_public = true;

create view public.public_live_results
with (security_invoker = false)
as
select
  run.id as run_id,
  roping.organization_id,
  organization.slug as organization_slug,
  roping.slug as roping_slug,
  roping.title as roping_title,
  division.id as division_id,
  division.name as division_name,
  division.result_status,
  entry.entry_number,
  person.first_name,
  person.last_name,
  run.run_number,
  run.draw_position,
  run.raw_time_seconds,
  run.penalty_seconds,
  case when run.raw_time_seconds is null then null else run.raw_time_seconds + run.penalty_seconds end as total_time_seconds,
  run.status,
  run.recorded_at
from public.runs run
join public.entries entry on entry.id = run.entry_id
join public.people person on person.id = entry.person_id
join public.roping_divisions division on division.id = run.roping_division_id
join public.ropings roping on roping.id = division.roping_id
join public.organizations organization on organization.id = roping.organization_id
where roping.is_public = true and run.status <> 'pending';

revoke all on public.public_organization_pages from public;
revoke all on public.public_roping_schedule from public;
revoke all on public.public_live_results from public;
grant select on public.public_organization_pages to anon, authenticated;
grant select on public.public_roping_schedule to anon, authenticated;
grant select on public.public_live_results to anon, authenticated;
grant execute on function public.create_organization(text, text) to authenticated;

alter publication supabase_realtime add table public.runs;
alter publication supabase_realtime add table public.ropings;
alter publication supabase_realtime add table public.roping_divisions;
