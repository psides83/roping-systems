create table public.producer_sponsors (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 120),
  website_url text not null default '' check(length(website_url)<=2000 and (website_url='' or website_url ~ '^https?://')),
  logo_path text,
  sort_order integer not null default 1 check(sort_order between 1 and 10000),
  is_active boolean not null default true,
  revision integer not null default 1 check(revision>0),
  created_at timestamptz not null default now(),
  check(logo_path is null or logo_path ~ ('^'||producer_id::text||'/'||id::text||'/[0-9a-f-]{36}\.(png|jpg|webp)$'))
);
create index producer_sponsors_display_idx on public.producer_sponsors(producer_id,is_active,sort_order,id);
alter table public.producer_sponsors enable row level security;
revoke all on public.producer_sponsors from public,anon,authenticated;
grant select on public.producer_sponsors to anon,authenticated;
grant insert,update,delete on public.producer_sponsors to authenticated;
create policy "Public sponsors" on public.producer_sponsors for select to anon,authenticated using(is_active);
create policy "Administrators manage sponsors" on public.producer_sponsors for all to authenticated
  using(public.can_administer_organization(producer_id)) with check(public.can_administer_organization(producer_id));
create trigger audit_producer_sponsors after insert or update or delete on public.producer_sponsors
  for each row execute function public.write_audit_log();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('sponsor-logos','sponsor-logos',true,2097152,array['image/png','image/jpeg','image/webp']);
create policy "Administrators read sponsor uploads" on storage.objects for select to authenticated
  using(bucket_id='sponsor-logos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.can_administer_organization(((storage.foldername(name))[1])::uuid));
create policy "Administrators upload sponsor logos" on storage.objects for insert to authenticated
  with check(bucket_id='sponsor-logos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.can_administer_organization(((storage.foldername(name))[1])::uuid));
create policy "Administrators delete sponsor logos" on storage.objects for delete to authenticated
  using(bucket_id='sponsor-logos' and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
    and public.can_administer_organization(((storage.foldername(name))[1])::uuid));
