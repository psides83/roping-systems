begin;
do $$
declare
  account uuid; roper uuid; payload jsonb; member jsonb; entry jsonb;
  accounts jsonb; event jsonb; item jsonb; membership_id uuid; rejected boolean; bonus jsonb;
begin
  select id into strict account from auth.users where lower(email)='psides83@hotmail.com';
  select r.id into strict roper from public.ropers r where exists(select 1 from public.memberships m join public.roping_entries e on e.roper_id=m.roper_id and e.producer_id=m.producer_id where m.roper_id=r.id) limit 1;
  update public.ropers set auth_user_id=null where auth_user_id=account;
  update public.ropers set auth_user_id=account where id=roper;
  perform set_config('request.jwt.claim.sub',account::text,true);
  payload:=public.my_roper_portal();
  if jsonb_array_length(payload->'memberships') <> (select count(*) from public.memberships where roper_id=roper) then raise exception 'Linked memberships missing'; end if;
  for member in select value from jsonb_array_elements(payload->'memberships') loop
    membership_id:=(member->>'id')::uuid;
    if not exists(select 1 from public.memberships m where m.id=(member->>'id')::uuid and m.roper_id=roper) then raise exception 'Another roper membership leaked'; end if;
    for entry in select value from jsonb_array_elements(member->'entries') loop
      if not exists(select 1 from public.roping_entries e join public.memberships m on m.id=(member->>'id')::uuid where e.id=(entry->>'id')::uuid and e.roper_id=roper and e.producer_id=m.producer_id) then raise exception 'Entry scope leaked'; end if;
    end loop;
    accounts:=public.my_roper_accounts(membership_id);
    bonus:=public.my_roper_bonus_positions(membership_id);
    if bonus->>'memberId' <> membership_id::text then raise exception 'Bonus ownership mismatch'; end if;
    if jsonb_array_length(coalesce(bonus->'source'->'profiles','[]'::jsonb))<>0 then raise exception 'Bonus competitor profiles leaked'; end if;
    for item in select value from jsonb_array_elements(bonus->'assignments') loop
      if item->>'reason' <> '' then raise exception 'Private assignment reason leaked'; end if;
      if not exists(select 1 from public.finals_position_assignments a where a.id=(item->>'id')::uuid and a.membership_id=membership_id) then raise exception 'Another member assignment leaked'; end if;
    end loop;
    if jsonb_array_length(accounts->'events') <> (select count(*) from public.events v join public.memberships m on m.id=membership_id
      where v.producer_id=m.producer_id and (
        exists(select 1 from public.roping_entries e where e.event_id=v.id and e.roper_id=roper and e.producer_id=m.producer_id)
        or exists(select 1 from public.entry_charges c where c.event_id=v.id and c.roper_id=roper and c.producer_id=m.producer_id)
        or exists(select 1 from public.event_payments p where p.event_id=v.id and p.roper_id=roper and p.producer_id=m.producer_id)
      )) then raise exception 'Roper account events missing'; end if;
    for event in select value from jsonb_array_elements(accounts->'events') loop
      if jsonb_array_length(event->'charges') <> (select count(*) from public.entry_charges c join public.memberships m on m.id=membership_id where c.event_id=(event->>'id')::uuid and c.roper_id=roper and c.producer_id=m.producer_id) then raise exception 'Itemized charges missing'; end if;
      if jsonb_array_length(event->'payments') <> (select count(*) from public.event_payments p join public.memberships m on m.id=membership_id where p.event_id=(event->>'id')::uuid and p.roper_id=roper and p.producer_id=m.producer_id) then raise exception 'Payment receipts missing'; end if;
      for item in select value from jsonb_array_elements(event->'charges') loop
        if not exists(select 1 from public.entry_charges c join public.memberships m on m.id=membership_id where c.id=(item->>'id')::uuid and c.roper_id=roper and c.producer_id=m.producer_id and c.event_id=(event->>'id')::uuid) then raise exception 'Another account charge leaked'; end if;
      end loop;
      for item in select value from jsonb_array_elements(event->'payments') loop
        if not exists(select 1 from public.event_payments p join public.memberships m on m.id=membership_id where p.id=(item->>'id')::uuid and p.roper_id=roper and p.producer_id=m.producer_id and p.event_id=(event->>'id')::uuid) then raise exception 'Another account payment leaked'; end if;
      end loop;
    end loop;
    for item in select value from jsonb_array_elements(accounts->'submissions') loop
      if item ? 'reviewNote' then raise exception 'Internal review notes leaked'; end if;
      if not exists(select 1 from public.online_entry_submissions s join public.memberships m on m.id=membership_id where s.id=(item->>'id')::uuid and s.producer_id=m.producer_id and (s.roper_id=roper or (s.roper_id is null and s.membership_id=membership_id))) then raise exception 'Another account submission leaked'; end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if jsonb_array_length(public.my_roper_portal()->'memberships') <> 0 then raise exception 'Unlinked account saw memberships'; end if;
  rejected:=false;
  begin perform public.my_roper_accounts(membership_id); exception when raise_exception then
    if sqlerrm not like '%not linked%' then raise; end if; rejected:=true;
  end;
  if not rejected then raise exception 'Unlinked user accessed a known member account'; end if;
  rejected:=false;
  begin perform public.my_roper_bonus_positions(membership_id); exception when raise_exception then
    if sqlerrm not like '%not linked%' then raise; end if; rejected:=true;
  end;
  if not rejected then raise exception 'Unlinked user accessed bonus positions'; end if;
  if has_function_privilege('anon','public.my_roper_portal()','EXECUTE') then raise exception 'Anonymous portal access granted'; end if;
  if has_function_privilege('anon','public.my_roper_accounts(uuid)','EXECUTE') then raise exception 'Anonymous balance access granted'; end if;
  if has_function_privilege('anon','public.my_roper_bonus_positions(uuid,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.portal_finals_source_internal(text,uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.anonymize_portal_finals_source(jsonb,uuid)','EXECUTE') then raise exception 'Bonus source privileges too broad'; end if;
end;
$$;
rollback;
