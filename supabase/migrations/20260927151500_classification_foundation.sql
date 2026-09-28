create type public.classification_review_status as enum ('open', 'approved', 'dismissed');

create table public.disciplines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  watch_threshold integer check (watch_threshold is null or watch_threshold > 0),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (id, organization_id)
);

create table public.classifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  discipline_id uuid not null,
  name text not null,
  description text,
  rank integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, discipline_id, name),
  unique (id, organization_id),
  unique (id, organization_id, discipline_id),
  foreign key (discipline_id, organization_id) references public.disciplines(id, organization_id)
);

create table public.member_classifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  discipline_id uuid not null,
  classification_id uuid not null,
  effective_on date not null default current_date,
  ended_on date,
  reason text,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (membership_id, organization_id) references public.organization_memberships(id, organization_id) on delete cascade,
  foreign key (discipline_id, organization_id) references public.disciplines(id, organization_id),
  foreign key (classification_id, organization_id, discipline_id) references public.classifications(id, organization_id, discipline_id),
  check (ended_on is null or ended_on >= effective_on)
);

create unique index one_current_classification_per_discipline
on public.member_classifications (membership_id, discipline_id)
where ended_on is null;

create index member_classifications_membership_idx
on public.member_classifications (membership_id, effective_on desc);

create table public.classification_watch_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  discipline_id uuid not null,
  occurred_on date not null default current_date,
  reason text not null,
  notes text,
  is_active boolean not null default true,
  recorded_by uuid references auth.users(id) on delete set null,
  cleared_by uuid references auth.users(id) on delete set null,
  cleared_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (membership_id, organization_id) references public.organization_memberships(id, organization_id) on delete cascade,
  foreign key (discipline_id, organization_id) references public.disciplines(id, organization_id)
);

create index classification_watch_events_open_idx
on public.classification_watch_events (organization_id, membership_id, discipline_id, occurred_on desc)
where is_active = true;

create table public.classification_reviews (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  discipline_id uuid not null,
  current_classification_id uuid,
  proposed_classification_id uuid,
  status public.classification_review_status not null default 'open',
  reason text not null,
  notes text,
  review_on date not null default current_date,
  created_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (membership_id, organization_id) references public.organization_memberships(id, organization_id) on delete cascade,
  foreign key (discipline_id, organization_id) references public.disciplines(id, organization_id),
  foreign key (current_classification_id, organization_id, discipline_id) references public.classifications(id, organization_id, discipline_id),
  foreign key (proposed_classification_id, organization_id, discipline_id) references public.classifications(id, organization_id, discipline_id)
);

create index classification_reviews_queue_idx
on public.classification_reviews (organization_id, status, review_on, created_at);

create unique index one_open_review_per_member_discipline
on public.classification_reviews (membership_id, discipline_id)
where status = 'open';

create trigger disciplines_set_updated_at before update on public.disciplines
for each row execute function public.set_updated_at();

create trigger classifications_set_updated_at before update on public.classifications
for each row execute function public.set_updated_at();

create trigger classification_reviews_set_updated_at before update on public.classification_reviews
for each row execute function public.set_updated_at();

alter table public.disciplines enable row level security;
alter table public.classifications enable row level security;
alter table public.member_classifications enable row level security;
alter table public.classification_watch_events enable row level security;
alter table public.classification_reviews enable row level security;

create or replace function public.create_default_discipline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.disciplines (organization_id, name, description, watch_threshold, sort_order)
  values (new.id, 'Tie-down', 'Traditional tiedown calf roping classifications', 3, 0);
  return new;
end;
$$;

create trigger organizations_create_default_discipline
after insert on public.organizations
for each row execute function public.create_default_discipline();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'disciplines',
    'classifications',
    'member_classifications',
    'classification_watch_events',
    'classification_reviews'
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

insert into public.disciplines (organization_id, name, description, watch_threshold, sort_order)
select organization.id, 'Tie-down', 'Traditional tiedown calf roping classifications', 3, 0
from public.organizations organization
where not exists (
  select 1 from public.disciplines discipline
  where discipline.organization_id = organization.id
);

insert into public.classifications (organization_id, discipline_id, name, rank, is_active)
select
  skill_level.organization_id,
  discipline.id,
  skill_level.name,
  skill_level.sort_order,
  skill_level.is_active
from public.skill_levels skill_level
join public.disciplines discipline
  on discipline.organization_id = skill_level.organization_id
 and discipline.name = 'Tie-down'
on conflict (organization_id, discipline_id, name) do nothing;

insert into public.member_classifications (
  organization_id,
  membership_id,
  discipline_id,
  classification_id,
  effective_on,
  reason
)
select
  membership.organization_id,
  membership.id,
  classification.discipline_id,
  classification.id,
  coalesce(membership.joined_on, current_date),
  'Imported from existing skill level'
from public.organization_memberships membership
join public.skill_levels skill_level on skill_level.id = membership.skill_level_id
join public.classifications classification
  on classification.organization_id = membership.organization_id
 and classification.name = skill_level.name
join public.disciplines discipline
  on discipline.id = classification.discipline_id
 and discipline.name = 'Tie-down'
where membership.skill_level_id is not null
on conflict do nothing;

create or replace function public.set_member_classification(
  target_organization_id uuid,
  target_membership_id uuid,
  target_classification_id uuid,
  new_effective_on date,
  change_reason text default null,
  source_review_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_discipline_id uuid;
  new_assignment_id uuid;
begin
  if not public.can_manage_organization(target_organization_id) then
    raise exception 'You do not have permission to manage classifications for this organization';
  end if;

  if not exists (
    select 1 from public.organization_memberships
    where id = target_membership_id and organization_id = target_organization_id
  ) then
    raise exception 'Member not found in this organization';
  end if;

  select discipline_id into target_discipline_id
  from public.classifications
  where id = target_classification_id
    and organization_id = target_organization_id
    and is_active = true;

  if target_discipline_id is null then
    raise exception 'Classification not found or inactive';
  end if;

  update public.member_classifications
  set ended_on = greatest(effective_on, new_effective_on)
  where membership_id = target_membership_id
    and discipline_id = target_discipline_id
    and ended_on is null;

  insert into public.member_classifications (
    organization_id,
    membership_id,
    discipline_id,
    classification_id,
    effective_on,
    reason,
    assigned_by
  ) values (
    target_organization_id,
    target_membership_id,
    target_discipline_id,
    target_classification_id,
    new_effective_on,
    nullif(trim(change_reason), ''),
    auth.uid()
  ) returning id into new_assignment_id;

  if source_review_id is not null then
    update public.classification_reviews
    set
      status = 'approved',
      proposed_classification_id = target_classification_id,
      resolved_by = auth.uid(),
      resolved_at = now()
    where id = source_review_id
      and organization_id = target_organization_id
      and membership_id = target_membership_id
      and status = 'open';
  end if;

  return new_assignment_id;
end;
$$;

grant execute on function public.set_member_classification(uuid, uuid, uuid, date, text, uuid) to authenticated;

create trigger audit_disciplines after insert or update or delete on public.disciplines
for each row execute function public.write_audit_log();

create trigger audit_classifications after insert or update or delete on public.classifications
for each row execute function public.write_audit_log();

create trigger audit_member_classifications after insert or update or delete on public.member_classifications
for each row execute function public.write_audit_log();

create trigger audit_classification_watch_events after insert or update or delete on public.classification_watch_events
for each row execute function public.write_audit_log();

create trigger audit_classification_reviews after insert or update or delete on public.classification_reviews
for each row execute function public.write_audit_log();
