begin;
do $$
declare
  producer uuid := '8f96f20f-932b-45ae-ac93-9832818de64d';
  member_id uuid; roper uuid; origin uuid; next_roping uuid;
  fine uuid := gen_random_uuid(); payment uuid := gen_random_uuid();
  waiver uuid := gen_random_uuid(); exception_id uuid := gen_random_uuid();
begin
  perform set_config('request.jwt.claim.sub', (select user_id::text from public.producer_staff where producer_id = producer and role = 'owner' limit 1), true);
  select m.id, m.roper_id into member_id, roper from public.memberships m
  where m.producer_id = producer and (select count(distinct e.event_roping_id) from public.roping_entries e where e.roper_id = m.roper_id and e.producer_id = producer) >= 2 limit 1;
  if member_id is null then raise exception 'Test requires a member entered in two ropings'; end if;
  select event_roping_id into origin from public.roping_entries where roper_id = roper and producer_id = producer limit 1;
  select event_roping_id into next_roping from public.roping_entries where roper_id = roper and producer_id = producer and event_roping_id <> origin limit 1;
  perform public.issue_member_fine(member_id,10000,'Test rule violation','both',origin,fine);
  perform public.issue_member_fine(member_id,10000,'Test rule violation','both',origin,fine);
  if public.member_fine_balance(fine) <> 10000 then raise exception 'Issue/idempotency failed'; end if;
  if public.member_fine_blocks(producer,roper,origin,'competition') then raise exception 'Origin roping incorrectly blocked'; end if;
  if not public.member_fine_blocks(producer,roper,next_roping,'competition') then raise exception 'Next roping not blocked'; end if;
  if not public.member_fine_blocks(producer,roper,origin,'entry') then raise exception 'New entries not blocked'; end if;
  perform public.record_member_fine_transaction(fine,'payment',2500,'Cash received at office',null,payment);
  if public.member_fine_balance(fine) <> 7500 or not public.member_fine_blocks(producer,roper,next_roping,'competition') then raise exception 'Partial payment incorrectly cleared restriction'; end if;
  perform public.manage_member_fine_exception(fine,exception_id,next_roping,now()+interval '1 hour','Approved temporary exception',false);
  if public.member_fine_blocks(producer,roper,next_roping,'competition') then raise exception 'Exception did not clear restriction'; end if;
  if not public.member_fine_blocks(producer,roper,origin,'entry') then raise exception 'Scoped exception leaked to other roping'; end if;
  perform public.manage_member_fine_exception(fine,exception_id,null,null,'Exception revoked by producer',true);
  if not public.member_fine_blocks(producer,roper,next_roping,'competition') then raise exception 'Revocation failed'; end if;
  perform public.record_member_fine_transaction(fine,'waiver',7500,'Producer waived remaining fine',null,waiver);
  if public.member_fine_balance(fine) <> 0 or public.member_fine_blocks(producer,roper,next_roping,'entry') then raise exception 'Settlement failed'; end if;
  perform public.record_member_fine_transaction(fine,'reversal',null,'Waiver entered in error',waiver,gen_random_uuid());
  if public.member_fine_balance(fine) <> 7500 then raise exception 'Reversal failed'; end if;
  begin
    perform public.record_member_fine_transaction(fine,'reversal',null,'Duplicate reversal attempted',waiver,gen_random_uuid());
    raise exception 'Duplicate reversal accepted';
  exception when others then
    if sqlerrm = 'Duplicate reversal accepted' then raise; end if;
  end;
  perform public.record_member_fine_transaction(fine,'payment',7500,'Cash balance received',null,gen_random_uuid());
  if public.member_fine_blocks(producer,roper,next_roping,'competition') then raise exception 'Full payment did not clear restriction'; end if;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  begin
    perform public.issue_member_fine(member_id,10000,'Unauthorized fine attempt','both',origin,gen_random_uuid());
    raise exception 'Unauthorized issue accepted';
  exception when others then
    if sqlerrm = 'Unauthorized issue accepted' then raise; end if;
  end;
end $$;
rollback;
