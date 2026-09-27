create extension if not exists "pgcrypto";

create type public.organization_role as enum ('owner', 'admin', 'operator', 'viewer');
create type public.membership_status as enum ('pending', 'active', 'expired', 'inactive');

create table public.people (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  first_name text not null,
  last_name text not null,
  email text,
  phone text,
  birth_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index people_email_unique on public.people (lower(email)) where email is not null;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  public_name text,
  email text,
  phone text,
  timezone text not null default 'America/Chicago',
  allow_guest_entries boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_users (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.skill_levels (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  member_number text not null,
  status public.membership_status not null default 'pending',
  skill_level_id uuid references public.skill_levels(id) on delete set null,
  joined_on date,
  expires_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, person_id),
  unique (organization_id, member_number)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger people_set_updated_at before update on public.people
for each row execute function public.set_updated_at();

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();

create trigger memberships_set_updated_at before update on public.organization_memberships
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
security definer set search_path = ''
language plpgsql
as $$
begin
  insert into public.people (auth_user_id, first_name, last_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'first_name', ''),
    coalesce(new.raw_user_meta_data ->> 'last_name', ''),
    new.email,
    new.phone
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();
