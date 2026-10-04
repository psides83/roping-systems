alter table public.producers
  add column season_start_month smallint not null default 1
  constraint producers_season_start_month_check check (season_start_month between 1 and 12);

create or replace view public.public_producer_pages
with (security_invoker = false)
as select id, name, coalesce(public_name, name) as public_name, slug,
  logo_path, brand_primary, brand_accent, season_start_month, timezone
from public.producers;
