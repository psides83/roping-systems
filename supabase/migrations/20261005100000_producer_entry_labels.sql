alter table public.producers add column entry_label_style text not null default 'number'
  check (entry_label_style in ('number', 'letter'));

create or replace view public.public_producer_pages
with (security_invoker = false)
as select id, name, coalesce(public_name, name) as public_name, slug,
  logo_path, brand_primary, brand_accent, season_start_month, timezone, entry_label_style
from public.producers;
