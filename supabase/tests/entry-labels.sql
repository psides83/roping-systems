begin;
select set_config('request.jwt.claim.sub', (
  select user_id::text from public.producer_staff
  where producer_id = '8f96f20f-932b-45ae-ac93-9832818de64d' and role = 'owner' limit 1
), true);
create temporary table original_entries as select id, entry_number from public.roping_entries;
update public.producers set entry_label_style = 'letter'
where id = '8f96f20f-932b-45ae-ac93-9832818de64d';
set local role anon;
do $$
begin
  if not exists (select 1 from public.public_producer_pages
    where slug = 'ultimate-calf-roping' and entry_label_style = 'letter') then
    raise exception 'Public results cannot read the letter-label preference';
  end if;
end;
$$;
reset role;
do $$
declare rejected boolean := false;
begin
  if not exists (select 1 from public.producer_audit_log
    where producer_id = '8f96f20f-932b-45ae-ac93-9832818de64d' and entity_type = 'producers'
      and actor_user_id = auth.uid() and after_data ->> 'entry_label_style' = 'letter') then
    raise exception 'Entry-label settings were not logged under the producer';
  end if;
  if exists ((select id, entry_number from public.roping_entries except select * from original_entries)
    union all (select * from original_entries except select id, entry_number from public.roping_entries)) then
    raise exception 'Changing labels modified entry identities';
  end if;
  begin
    update public.producers set entry_label_style = 'invalid'
      where id = '8f96f20f-932b-45ae-ac93-9832818de64d';
  exception when check_violation then rejected := true; end;
  if not rejected then raise exception 'Invalid entry-label preference was accepted'; end if;
end;
$$;
rollback;
