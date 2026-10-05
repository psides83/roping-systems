-- Publication state is the source of truth for public event visibility.
create or replace function public.is_payout_plan_public(target_plan_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.event_roping_payout_plans plan
    join public.events event on event.id = plan.event_id
    where plan.id = target_plan_id
      and event.publication_state = 'published'
  );
$$;
revoke all on function public.is_payout_plan_public(uuid) from public, anon, authenticated;
