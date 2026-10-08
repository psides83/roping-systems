-- Expose fee definitions only, never contestant balances or payments.
create or replace function public.public_online_entry_fees(
  target_producer_slug text,
  target_event_slug text
)
returns table (
  event_roping_id uuid,
  event_fee_id uuid,
  title text,
  amount_cents integer,
  kind text,
  scope text,
  is_required boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, f.id, f.title, f.amount_cents, f.kind::text, f.scope::text, f.is_required
  from public.producers p
  join public.events e on e.producer_id = p.id
  join public.event_ropings r on r.event_id = e.id and r.producer_id = p.id
  join public.event_fees f on f.event_id = e.id and f.producer_id = p.id
    and (f.event_roping_id = r.id or f.event_roping_id is null)
  where p.slug = target_producer_slug and e.slug = target_event_slug
    and e.publication_state = 'published'
  order by r.sort_order, f.sort_order, f.title, f.id;
$$;

revoke all on function public.public_online_entry_fees(text, text) from public;
grant execute on function public.public_online_entry_fees(text, text) to anon, authenticated;
