-- Protect direct manager updates as well as the settings RPC.
create function public.validate_roping_entry_limit() returns trigger language plpgsql security definer set search_path='' as $$
declare used integer;
begin
  if new.entry_limit is null or new.entry_limit is not distinct from old.entry_limit then return new; end if;
  select count(*) into used from public.roping_entries where event_roping_id=new.id and competition_status='active';
  used:=used+(select count(*) from public.roping_waitlist where event_roping_id=new.id and status='offered');
  if new.entry_limit<used then raise exception 'The limit cannot be lower than accepted entries and reserved offers'; end if;
  return new;
end $$;
create trigger validate_roping_entry_limit before update of entry_limit on public.event_ropings for each row execute function public.validate_roping_entry_limit();
revoke all on function public.validate_roping_entry_limit() from public,anon,authenticated;
