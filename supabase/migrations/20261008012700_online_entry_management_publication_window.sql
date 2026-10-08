create or replace function public.online_entry_change_window(target_submission_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select s.status='pending' and e.is_public and e.publication_state='published'
    and e.status not in ('entries_closed','in_progress','completed','cancelled')
    and (e.entries_open_at is null or e.entries_open_at<=now())
    and coalesce(e.entries_close_at,e.starts_at)>now()
    and not exists(select 1 from public.online_entry_submission_ropings i join public.event_ropings r on r.id=i.event_roping_id
      where i.submission_id=s.id and r.event_day_status in ('in_progress','completed'))
    from public.online_entry_submissions s join public.events e on e.id=s.event_id and e.producer_id=s.producer_id
    where s.id=target_submission_id),false);
$$;
