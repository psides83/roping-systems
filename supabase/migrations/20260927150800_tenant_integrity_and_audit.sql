alter table public.skill_levels add constraint skill_levels_id_organization_unique unique (id, organization_id);
alter table public.organization_memberships add constraint memberships_id_organization_unique unique (id, organization_id);
alter table public.division_templates add constraint division_templates_id_organization_unique unique (id, organization_id);
alter table public.fee_templates add constraint fee_templates_id_organization_unique unique (id, organization_id);
alter table public.ropings add constraint ropings_id_organization_unique unique (id, organization_id);
alter table public.roping_divisions add constraint roping_divisions_id_organization_unique unique (id, organization_id);
alter table public.roping_fees add constraint roping_fees_id_organization_unique unique (id, organization_id);
alter table public.entries add constraint entries_id_organization_unique unique (id, organization_id);

alter table public.organization_memberships
  add constraint memberships_skill_level_same_organization
  foreign key (skill_level_id, organization_id) references public.skill_levels(id, organization_id);

alter table public.fee_templates
  add constraint fee_template_division_same_organization
  foreign key (division_template_id, organization_id) references public.division_templates(id, organization_id);

alter table public.roping_divisions
  add constraint roping_division_event_same_organization
  foreign key (roping_id, organization_id) references public.ropings(id, organization_id),
  add constraint roping_division_template_same_organization
  foreign key (source_template_id, organization_id) references public.division_templates(id, organization_id);

alter table public.roping_fees
  add constraint roping_fee_event_same_organization
  foreign key (roping_id, organization_id) references public.ropings(id, organization_id),
  add constraint roping_fee_division_same_organization
  foreign key (roping_division_id, organization_id) references public.roping_divisions(id, organization_id),
  add constraint roping_fee_template_same_organization
  foreign key (source_template_id, organization_id) references public.fee_templates(id, organization_id);

alter table public.entries
  add constraint entry_event_same_organization
  foreign key (roping_id, organization_id) references public.ropings(id, organization_id),
  add constraint entry_division_same_organization
  foreign key (roping_division_id, organization_id) references public.roping_divisions(id, organization_id),
  add constraint entry_membership_same_organization
  foreign key (membership_id, organization_id) references public.organization_memberships(id, organization_id);

alter table public.entry_charges
  add constraint charge_event_same_organization
  foreign key (roping_id, organization_id) references public.ropings(id, organization_id),
  add constraint charge_entry_same_organization
  foreign key (entry_id, organization_id) references public.entries(id, organization_id),
  add constraint charge_fee_same_organization
  foreign key (roping_fee_id, organization_id) references public.roping_fees(id, organization_id);

alter table public.runs
  add constraint run_division_same_organization
  foreign key (roping_division_id, organization_id) references public.roping_divisions(id, organization_id),
  add constraint run_entry_same_organization
  foreign key (entry_id, organization_id) references public.entries(id, organization_id);

create table public.audit_log (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_organization_created_idx on public.audit_log (organization_id, created_at desc);
alter table public.audit_log enable row level security;

create policy "Organization users can read audit history"
on public.audit_log for select
using (public.has_organization_access(organization_id));

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_record jsonb;
  new_record jsonb;
  target_organization_id uuid;
  target_entity_id uuid;
begin
  old_record := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end;
  new_record := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end;
  target_organization_id := coalesce((new_record ->> 'organization_id')::uuid, (old_record ->> 'organization_id')::uuid);
  target_entity_id := coalesce((new_record ->> 'id')::uuid, (old_record ->> 'id')::uuid);

  insert into public.audit_log (
    organization_id, actor_user_id, entity_type, entity_id, action, before_data, after_data
  ) values (
    target_organization_id, auth.uid(), tg_table_name, target_entity_id, lower(tg_op), old_record, new_record
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger audit_memberships after insert or update or delete on public.organization_memberships for each row execute function public.write_audit_log();
create trigger audit_division_templates after insert or update or delete on public.division_templates for each row execute function public.write_audit_log();
create trigger audit_fee_templates after insert or update or delete on public.fee_templates for each row execute function public.write_audit_log();
create trigger audit_ropings after insert or update or delete on public.ropings for each row execute function public.write_audit_log();
create trigger audit_entries after insert or update or delete on public.entries for each row execute function public.write_audit_log();
create trigger audit_runs after insert or update or delete on public.runs for each row execute function public.write_audit_log();

create view public.organization_team_directory
with (security_invoker = false)
as
select
  organization_user.organization_id,
  organization_user.user_id,
  organization_user.role,
  auth_user.email,
  organization_user.created_at
from public.organization_users organization_user
join auth.users auth_user on auth_user.id = organization_user.user_id
where public.has_organization_access(organization_user.organization_id);

revoke all on public.organization_team_directory from public;
grant select on public.organization_team_directory to authenticated;
