create function public.preserve_waitlist_entry_origin() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.submission_id is not null and new.entry_id is not null and new.entry_id is distinct from old.entry_id then
    update public.roping_entries set source='online' where id=new.entry_id and producer_id=new.producer_id and event_roping_id=new.event_roping_id;
  end if;
  return new;
end $$;
create trigger preserve_waitlist_entry_origin after update of entry_id on public.roping_waitlist
  for each row execute function public.preserve_waitlist_entry_origin();
revoke all on function public.preserve_waitlist_entry_origin() from public,anon,authenticated;
