alter table public.division_templates
  add column discipline_id uuid,
  add column classification_id uuid,
  add constraint division_template_discipline_same_organization
    foreign key (discipline_id, organization_id)
    references public.disciplines(id, organization_id),
  add constraint division_template_classification_same_division
    foreign key (classification_id, organization_id, discipline_id)
    references public.classifications(id, organization_id, discipline_id);

alter table public.roping_divisions
  add column discipline_id uuid,
  add column classification_id uuid,
  add constraint roping_division_discipline_same_organization
    foreign key (discipline_id, organization_id)
    references public.disciplines(id, organization_id),
  add constraint roping_division_classification_same_division
    foreign key (classification_id, organization_id, discipline_id)
    references public.classifications(id, organization_id, discipline_id);

create or replace function public.apply_division_classification_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source_template_id is not null then
    select discipline_id, classification_id
      into new.discipline_id, new.classification_id
    from public.division_templates
    where id = new.source_template_id and organization_id = new.organization_id;
  end if;
  return new;
end;
$$;

create trigger roping_divisions_apply_classification_settings
before insert on public.roping_divisions
for each row execute function public.apply_division_classification_settings();
