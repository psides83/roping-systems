create or replace function public.can_enter_event(target_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.events e where e.id=target_event and
    (public.can_manage_organization(e.producer_id) or (
      e.status not in ('completed','cancelled') and exists(
        select 1 from public.producer_staff s join public.staff_event_assignments a
          on a.producer_id=s.producer_id and a.user_id=s.user_id
        where s.producer_id=e.producer_id and s.user_id=auth.uid()
          and s.role='entry_office' and a.event_id=e.id))));
$$;
