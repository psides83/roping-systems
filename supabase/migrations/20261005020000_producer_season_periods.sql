create table public.producer_seasons (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index producer_seasons_dates_idx on public.producer_seasons(producer_id, starts_on desc);
alter table public.producer_seasons enable row level security;
grant select, insert, update, delete on public.producer_seasons to authenticated;
create policy "Staff can read producer seasons" on public.producer_seasons for select to authenticated
using (public.has_organization_access(producer_id));
create policy "Administrators can manage producer seasons" on public.producer_seasons for all to authenticated
using (exists (select 1 from public.producer_staff where producer_id = producer_seasons.producer_id and user_id = auth.uid() and role in ('owner', 'admin')))
with check (exists (select 1 from public.producer_staff where producer_id = producer_seasons.producer_id and user_id = auth.uid() and role in ('owner', 'admin')));

create function public.validate_producer_season_period() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.producer_id <> old.producer_id then
    raise exception 'Seasons cannot be moved between producers';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.producer_id::text, 0));
  if exists (select 1 from public.producer_seasons season
    where season.producer_id = new.producer_id and season.id <> new.id
      and season.starts_on <= new.ends_on and season.ends_on >= new.starts_on) then
    raise exception 'Season dates overlap another season';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_producer_season_period() from public;
create trigger validate_producer_season_period before insert or update on public.producer_seasons
for each row execute function public.validate_producer_season_period();

-- Convert the existing annual setting into dated records without changing prior grouping.
insert into public.producer_seasons(producer_id, name, starts_on, ends_on)
select producer.id, case when producer.season_start_month = 1 then years.year::text
  else years.year::text || '-' || (years.year + 1)::text end,
  make_date(years.year, producer.season_start_month, 1),
  (make_date(years.year + 1, producer.season_start_month, 1) - 1)
from public.producers producer
cross join lateral (
  select distinct extract(year from event.starts_at at time zone producer.timezone)::int
    - case when extract(month from event.starts_at at time zone producer.timezone) < producer.season_start_month then 1 else 0 end as year
  from public.events event where event.producer_id = producer.id
  union
  select extract(year from now() at time zone producer.timezone)::int
    - case when extract(month from now() at time zone producer.timezone) < producer.season_start_month then 1 else 0 end
) years;

create trigger audit_producer_seasons after insert or update or delete on public.producer_seasons
for each row execute function public.write_audit_log();
create view public.public_producer_seasons with (security_invoker = false) as
select id, producer_id, name, starts_on, ends_on from public.producer_seasons;
revoke all on public.public_producer_seasons from public;
grant select on public.public_producer_seasons to anon, authenticated;
