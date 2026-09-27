alter table public.organizations
add column brand_primary text not null default '#17251F'
  check (brand_primary ~ '^#[0-9A-Fa-f]{6}$'),
add column brand_accent text not null default '#BB3E24'
  check (brand_accent ~ '^#[0-9A-Fa-f]{6}$');

create or replace view public.public_organization_pages
with (security_invoker = false)
as
select
  id,
  name,
  coalesce(public_name, name) as public_name,
  slug,
  logo_path,
  brand_primary,
  brand_accent
from public.organizations;

revoke all on public.public_organization_pages from public;
grant select on public.public_organization_pages to anon, authenticated;
