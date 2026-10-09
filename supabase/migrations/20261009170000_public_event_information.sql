create table public.event_information (
  id uuid primary key references public.events(id) on delete cascade,
  producer_id uuid not null references public.producers(id),
  flyer_url text not null default '' check (length(flyer_url)<=2000 and (flyer_url='' or flyer_url ~ '^https?://')),
  directions text not null default '' check (length(directions)<=4000),
  venue_information text not null default '' check (length(venue_information)<=4000),
  contact_name text not null default '' check (length(contact_name)<=120),
  contact_phone text not null default '' check (contact_phone='' or contact_phone ~ '^\([0-9]{3}\) [0-9]{3}-[0-9]{4}$'),
  contact_email text not null default '' check (length(contact_email)<=320),
  entry_information text not null default '' check (length(entry_information)<=4000),
  foreign key (id,producer_id) references public.events(id,producer_id)
);
alter table public.event_information enable row level security;
grant select on public.event_information to anon,authenticated;
grant insert,update,delete on public.event_information to authenticated;
create policy "Published event information" on public.event_information for select to anon,authenticated
  using (exists(select 1 from public.public_event_schedule e where e.id=event_information.id));
create policy "Managers maintain event information" on public.event_information for all to authenticated
  using (public.can_manage_event(id)) with check (public.can_manage_event(id));
create trigger audit_event_information after insert or update or delete on public.event_information
  for each row execute function public.write_audit_log();
