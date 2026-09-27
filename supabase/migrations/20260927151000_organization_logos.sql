alter table public.organizations
add column logo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'organization-logos',
  'organization-logos',
  true,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Owners and admins can upload organization logos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'organization-logos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.can_administer_organization(((storage.foldername(name))[1])::uuid)
);

create policy "Owners and admins can update organization logos"
on storage.objects for update to authenticated
using (
  bucket_id = 'organization-logos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.can_administer_organization(((storage.foldername(name))[1])::uuid)
)
with check (
  bucket_id = 'organization-logos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.can_administer_organization(((storage.foldername(name))[1])::uuid)
);

create policy "Owners and admins can delete organization logos"
on storage.objects for delete to authenticated
using (
  bucket_id = 'organization-logos'
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and public.can_administer_organization(((storage.foldername(name))[1])::uuid)
);

create or replace view public.public_organization_pages
with (security_invoker = false)
as
select id, name, coalesce(public_name, name) as public_name, slug, logo_path
from public.organizations;

revoke all on public.public_organization_pages from public;
grant select on public.public_organization_pages to anon, authenticated;
