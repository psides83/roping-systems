create or replace function public.can_administer_organization(target_organization_id uuid)
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
      and role in ('owner', 'admin')
  );
$$;

drop policy "Managers can update their organizations" on public.organizations;
create policy "Owners and admins can update their organizations"
on public.organizations for update
using (public.can_administer_organization(id))
with check (public.can_administer_organization(id));

drop policy "Owners and admins can manage organization teams" on public.organization_users;
create policy "Owners and admins can manage organization teams"
on public.organization_users for all
using (public.can_administer_organization(organization_id))
with check (public.can_administer_organization(organization_id));
