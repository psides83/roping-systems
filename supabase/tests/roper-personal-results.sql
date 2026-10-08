begin;
do $$
declare staff uuid; account uuid:=gen_random_uuid(); member record; entry jsonb; result jsonb; expected bigint; page integer; checked integer:=0; private_result jsonb;
begin
  select id into strict staff from auth.users where lower(email)='psides83@hotmail.com';
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(account,'results-test-'||account::text||'@example.com',now(),'{}');
  perform set_config('request.jwt.claim.sub',staff::text,true);
  for member in select m.* from public.memberships m where public.can_manage_organization(m.producer_id)
    and exists(select 1 from public.roping_entries e where e.roper_id=m.roper_id and e.producer_id=m.producer_id) limit 12 loop
    update public.ropers set auth_user_id=null where auth_user_id=account;
    update public.ropers set auth_user_id=account where id=member.roper_id;
    page:=1;
    loop
      perform set_config('request.jwt.claim.sub',account::text,true);
      result:=public.my_roper_results(member.id,null,page);
      for entry in select value from jsonb_array_elements(result->'entries') loop
        if not exists(select 1 from public.roping_entries e where e.id=(entry->>'id')::uuid and e.roper_id=member.roper_id and e.producer_id=member.producer_id) then raise exception 'Another roper result leaked'; end if;
        perform set_config('request.jwt.claim.sub',staff::text,true);
        select coalesce(sum(a.cents),0) into expected from (
          select a.payout_cents cents from public.event_roping_payout_plans p join public.event_ropings r on r.id=p.event_roping_id
          cross join lateral public.calculate_roping_payout_results(p.id) a
          where p.event_roping_id=(entry->>'ropingId')::uuid and a.entry_id=(entry->>'id')::uuid
            and not(r.competition_format='four_d' and p.pool_type='main')
          union all
          select a.payout_cents from public.event_roping_payout_plans p join public.event_ropings r on r.id=p.event_roping_id
          cross join lateral public.calculate_four_d_payout_results(p.id) a
          where p.event_roping_id=(entry->>'ropingId')::uuid and a.entry_id=(entry->>'id')::uuid
            and r.competition_format='four_d' and p.pool_type='main'
        ) a where a.cents>0;
        if expected<>(select coalesce(sum((value->>'payoutCents')::bigint),0) from jsonb_array_elements(entry->'awards')) then raise exception 'Portal winnings differ from canonical payouts'; end if;
        if exists(select 1 from jsonb_array_elements(entry->'awards') where value->>'entryId'<>entry->>'id') then raise exception 'Another entry award leaked'; end if;
        checked:=checked+1;
        if checked=1 then
          update public.events set publication_state='unpublished' where id=(select event_id from public.roping_entries where id=(entry->>'id')::uuid);
          perform set_config('request.jwt.claim.sub',account::text,true);
          private_result:=public.my_roper_results(member.id,null,page);
          if not exists(select 1 from jsonb_array_elements(private_result->'entries') r
            where r->>'id'=entry->>'id' and (r->>'public')::boolean=false
              and (select coalesce(sum((a->>'payoutCents')::bigint),0) from jsonb_array_elements(r->'awards') a)=expected) then
            raise exception 'Private own results or winnings unavailable'; end if;
        end if;
      end loop;
      exit when page*25>=(result->>'total')::integer;
      page:=page+1;
    end loop;
  end loop;
  if checked=0 then raise exception 'No actual results tested'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.my_roper_results(member.id);
    raise exception 'Unlinked membership access allowed';
  exception when raise_exception then if sqlerrm not like '%not linked%' then raise; end if; end;
  if has_function_privilege('anon','public.my_roper_results(uuid,uuid,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.portal_internal_calculate_roping_payout_results(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.portal_internal_calculate_roping_payouts(uuid)','EXECUTE')
    or has_function_privilege('authenticated','public.portal_internal_calculate_four_d_payout_results(uuid)','EXECUTE') then raise exception 'Private payout helper access exposed'; end if;
end;
$$;
rollback;
