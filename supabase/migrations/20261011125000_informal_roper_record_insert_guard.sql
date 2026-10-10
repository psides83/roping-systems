create function public.initialize_roper_record_approval() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  new.formally_approved:=public.requires_membership(new.producer_id)
    and new.status='active' and new.formally_approved;
  return new;
end $$;
revoke all on function public.initialize_roper_record_approval() from public,anon,authenticated;
create trigger memberships_initialize_approval before insert on public.memberships
for each row execute function public.initialize_roper_record_approval();

-- The entry always belongs to the record for its actual producer and roper.
drop trigger entries_attach_roper_record on public.roping_entries;
create trigger entries_attach_roper_record before insert or update of
  event_roping_id,roper_id,membership_id on public.roping_entries
for each row execute function public.attach_entry_roper_record();
