create table public.membership_forms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  title text not null default 'Membership Application',
  introduction text,
  publication_state text not null default 'draft'
    check (publication_state in ('draft', 'published', 'unpublished')),
  standard_fields jsonb not null default '[]'::jsonb
    check (jsonb_typeof(standard_fields) = 'array'),
  custom_sections jsonb not null default '[]'::jsonb
    check (jsonb_typeof(custom_sections) = 'array'),
  release_text text,
  require_signature boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.membership_applications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_form_id uuid not null references public.membership_forms(id) on delete restrict,
  applicant_name text not null,
  applicant_email text,
  responses jsonb not null check (jsonb_typeof(responses) = 'object'),
  form_snapshot jsonb not null check (jsonb_typeof(form_snapshot) = 'object'),
  release_accepted boolean not null default false,
  signature_name text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index membership_applications_producer_status_idx
on public.membership_applications (organization_id, status, submitted_at desc);

create trigger membership_forms_set_updated_at
before update on public.membership_forms
for each row execute function public.set_updated_at();
create trigger membership_applications_set_updated_at
before update on public.membership_applications
for each row execute function public.set_updated_at();
create trigger audit_membership_forms
after insert or update or delete on public.membership_forms
for each row execute function public.write_audit_log();
create trigger audit_membership_applications
after insert or update or delete on public.membership_applications
for each row execute function public.write_audit_log();

alter table public.membership_forms enable row level security;
alter table public.membership_applications enable row level security;

create policy "Producer users can read membership forms"
on public.membership_forms for select
using (public.has_organization_access(organization_id));
create policy "Producer managers can create membership forms"
on public.membership_forms for insert
with check (public.can_manage_organization(organization_id));
create policy "Producer managers can update membership forms"
on public.membership_forms for update
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));
create policy "Producer users can read membership applications"
on public.membership_applications for select
using (public.has_organization_access(organization_id));
create policy "Producer managers can update membership applications"
on public.membership_applications for update
using (public.can_manage_organization(organization_id))
with check (public.can_manage_organization(organization_id));

create view public.public_membership_forms
with (security_invoker = false)
as
select
  form.id,
  form.organization_id,
  organization.slug as organization_slug,
  coalesce(organization.public_name, organization.name) as organization_name,
  organization.logo_path,
  organization.brand_primary,
  organization.brand_accent,
  form.title,
  form.introduction,
  form.standard_fields,
  form.custom_sections,
  form.release_text,
  form.require_signature
from public.membership_forms form
join public.organizations organization on organization.id = form.organization_id
where form.publication_state = 'published';

revoke all on public.public_membership_forms from public;
grant select on public.public_membership_forms to anon, authenticated;

create function public.submit_membership_application(
  target_form_id uuid,
  application_responses jsonb,
  accepted_release boolean,
  entered_signature_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  form_record public.membership_forms%rowtype;
  new_application_id uuid;
  first_name text;
  last_name text;
  email_address text;
begin
  select * into form_record
  from public.membership_forms
  where id = target_form_id and publication_state = 'published';
  if form_record.id is null then
    raise exception 'This membership form is not available';
  end if;
  if jsonb_typeof(application_responses) <> 'object' then
    raise exception 'The membership application is invalid';
  end if;
  if nullif(trim(form_record.release_text), '') is not null and not accepted_release then
    raise exception 'Accept the release before submitting';
  end if;
  if form_record.require_signature
    and length(trim(coalesce(entered_signature_name, ''))) < 2 then
    raise exception 'Enter the signer name';
  end if;

  first_name := nullif(trim(application_responses ->> 'first_name'), '');
  last_name := nullif(trim(application_responses ->> 'last_name'), '');
  email_address := nullif(trim(application_responses ->> 'email'), '');
  if first_name is null or last_name is null then
    raise exception 'First and last name are required';
  end if;

  insert into public.membership_applications (
    organization_id, membership_form_id, applicant_name, applicant_email,
    responses, form_snapshot, release_accepted, signature_name
  ) values (
    form_record.organization_id, form_record.id,
    first_name || ' ' || last_name, email_address, application_responses,
    jsonb_build_object(
      'title', form_record.title,
      'standard_fields', form_record.standard_fields,
      'custom_sections', form_record.custom_sections,
      'release_text', form_record.release_text
    ),
    accepted_release, nullif(trim(entered_signature_name), '')
  ) returning id into new_application_id;

  return new_application_id;
end;
$$;

revoke all on function public.submit_membership_application(uuid, jsonb, boolean, text) from public;
grant execute on function public.submit_membership_application(uuid, jsonb, boolean, text) to anon, authenticated;
