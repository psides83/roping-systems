-- Tenant-scoped relationships must match the original deletion behavior.
-- Only source references are cleared; copied event settings remain intact.
alter table public.roping_template_fees
  drop constraint fee_template_division_same_organization,
  add constraint fee_template_division_same_organization
    foreign key (roping_template_id, producer_id)
    references public.roping_templates(id, producer_id) on delete cascade;

alter table public.event_ropings
  drop constraint roping_division_template_same_organization,
  add constraint roping_division_template_same_organization
    foreign key (roping_template_id, producer_id)
    references public.roping_templates(id, producer_id)
    on delete set null (roping_template_id);

alter table public.event_fees
  drop constraint roping_fee_template_same_organization,
  add constraint roping_fee_template_same_organization
    foreign key (roping_template_fee_id, producer_id)
    references public.roping_template_fees(id, producer_id)
    on delete set null (roping_template_fee_id);
