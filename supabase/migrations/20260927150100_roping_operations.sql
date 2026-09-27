create type public.roping_status as enum ('draft', 'scheduled', 'entries_open', 'entries_closed', 'in_progress', 'completed', 'cancelled');
create type public.result_status as enum ('unofficial', 'official');
create type public.fee_scope as enum ('entry', 'contestant_division', 'contestant_event');
create type public.entry_source as enum ('online', 'office', 'imported');
create type public.payment_status as enum ('unpaid', 'paid_cash', 'comped', 'refunded');
create type public.run_status as enum ('pending', 'complete', 'no_time', 'scratch', 'rerun');

create table public.division_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  number_of_runs integer not null default 1 check (number_of_runs > 0),
  maximum_entries_per_person integer check (maximum_entries_per_person is null or maximum_entries_per_person > 0),
  allow_guests boolean not null default false,
  eligibility_rules jsonb not null default '{}'::jsonb,
  scoring_rules jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table public.fee_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  division_template_id uuid references public.division_templates(id) on delete cascade,
  title text not null,
  amount_cents integer not null check (amount_cents >= 0),
  scope public.fee_scope not null,
  included_in_entry_price boolean not null default false,
  contributes_to_payout boolean not null default false,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.ropings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  slug text not null,
  venue_name text,
  address text,
  starts_at timestamptz not null,
  entries_open_at timestamptz,
  entries_close_at timestamptz,
  status public.roping_status not null default 'draft',
  result_status public.result_status not null default 'unofficial',
  is_public boolean not null default false,
  public_draw boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table public.roping_divisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null references public.ropings(id) on delete cascade,
  source_template_id uuid references public.division_templates(id) on delete set null,
  name text not null,
  description text,
  number_of_runs integer not null default 1 check (number_of_runs > 0),
  maximum_entries_per_person integer check (maximum_entries_per_person is null or maximum_entries_per_person > 0),
  allow_guests boolean not null default false,
  eligibility_rules jsonb not null default '{}'::jsonb,
  scoring_rules jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  result_status public.result_status not null default 'unofficial',
  created_at timestamptz not null default now(),
  unique (roping_id, name)
);

create table public.roping_fees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null references public.ropings(id) on delete cascade,
  roping_division_id uuid references public.roping_divisions(id) on delete cascade,
  source_template_id uuid references public.fee_templates(id) on delete set null,
  title text not null,
  amount_cents integer not null check (amount_cents >= 0),
  scope public.fee_scope not null,
  included_in_entry_price boolean not null default false,
  contributes_to_payout boolean not null default false,
  is_required boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null references public.ropings(id) on delete cascade,
  roping_division_id uuid not null references public.roping_divisions(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  membership_id uuid references public.organization_memberships(id) on delete set null,
  entry_number integer not null default 1 check (entry_number > 0),
  source public.entry_source not null default 'office',
  payment_status public.payment_status not null default 'unpaid',
  is_eligible boolean not null default true,
  eligibility_note text,
  entered_at timestamptz not null default now(),
  unique (roping_division_id, person_id, entry_number)
);

create table public.entry_charges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_id uuid not null references public.ropings(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  entry_id uuid references public.entries(id) on delete cascade,
  roping_fee_id uuid not null references public.roping_fees(id) on delete restrict,
  title text not null,
  amount_cents integer not null check (amount_cents >= 0),
  waived_at timestamptz,
  waiver_reason text,
  created_at timestamptz not null default now()
);

create unique index one_event_fee_per_person
on public.entry_charges (roping_id, person_id, roping_fee_id)
where entry_id is null;

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  roping_division_id uuid not null references public.roping_divisions(id) on delete cascade,
  entry_id uuid not null references public.entries(id) on delete cascade,
  run_number integer not null default 1 check (run_number > 0),
  draw_position integer,
  raw_time_seconds numeric(8, 3) check (raw_time_seconds is null or raw_time_seconds >= 0),
  penalty_seconds numeric(8, 3) not null default 0 check (penalty_seconds >= 0),
  status public.run_status not null default 'pending',
  note text,
  recorded_by uuid references auth.users(id) on delete set null,
  recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entry_id, run_number),
  unique (roping_division_id, run_number, draw_position)
);

create index memberships_organization_idx on public.organization_memberships (organization_id, status);
create index ropings_organization_date_idx on public.ropings (organization_id, starts_at desc);
create index entries_division_idx on public.entries (roping_division_id, entered_at);
create index runs_draw_idx on public.runs (roping_division_id, run_number, draw_position);

create trigger division_templates_set_updated_at before update on public.division_templates for each row execute function public.set_updated_at();
create trigger ropings_set_updated_at before update on public.ropings for each row execute function public.set_updated_at();
create trigger runs_set_updated_at before update on public.runs for each row execute function public.set_updated_at();
