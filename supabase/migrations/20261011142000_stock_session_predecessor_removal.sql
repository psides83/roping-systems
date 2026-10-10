alter table public.event_stock_sessions drop constraint event_stock_sessions_check;
alter table public.event_stock_sessions add constraint stock_session_start_listing check(
  (start_time is null) <> (follows_roping_id is null)
  or (not active and start_time is null and follows_roping_id is null)
);
create function public.close_stock_sessions_before_roping_removal() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update public.event_stock_sessions set active=false,follows_roping_id=null,
    note=left(concat_ws(' ',nullif(note,''),'Preceding roping removed; session closed.'),1000)
  where follows_roping_id=old.id;
  return old;
end $$;
revoke all on function public.close_stock_sessions_before_roping_removal() from public,anon,authenticated;
create trigger close_practice_sessions before delete on public.event_ropings
for each row execute function public.close_stock_sessions_before_roping_removal();
