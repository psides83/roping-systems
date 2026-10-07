begin;
do $$
declare owner_id uuid; roping record; season record; rule_id uuid; source jsonb; finish jsonb; context jsonb; revision bigint; rejected boolean:=false;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select r.* into strict roping from public.event_ropings r join public.producers p on p.id=r.producer_id
    where p.slug='ultimate-calf-roping' and r.result_status='official' and exists(select 1 from public.competition_runs run join public.roping_entries e on e.id=run.entry_id where run.event_roping_id=r.id and run.round_number=1 and run.status='complete' and not run.is_excluded and e.membership_id is not null and e.competition_status='active') limit 1;
  select * into strict season from public.producer_seasons where producer_id=roping.producer_id and roping.scheduled_date between starts_on and ends_on limit 1;
  insert into public.finals_qualification_rules(producer_id,season_id,event_roping_id,stage,round_number,places)
    values(roping.producer_id,season.id,roping.id,'go_round',1,'[{"place":1,"positions":1}]')
    on conflict(event_roping_id,stage,round_number) do update set enabled=true,places=excluded.places,repeat_policy='accumulate' returning id into rule_id;
  source:=public.finals_qualification_source('ultimate-calf-roping',season.id);
  select item into strict finish from jsonb_array_elements(source->'finishes') item where item->>'ropingId'=roping.id::text and item->>'stage'='go_round' and (item->>'round')::integer=1 and item->>'memberId' is not null order by (item->>'place')::integer limit 1;
  update public.finals_qualification_rules set places=jsonb_build_array(jsonb_build_object('place',(finish->>'place')::integer,'positions',1)) where id=rule_id;
  select jsonb_agg(jsonb_build_array(item->>'entryId',item->>'memberId',(item->>'place')::integer) order by item->>'entryId') into context from jsonb_array_elements(source->'finishes') item where item->>'ropingId'=roping.id::text and item->>'stage'='go_round' and (item->>'round')::integer=1 and item->>'place'=finish->>'place';
  select standings_revision into revision from public.producers where id=roping.producer_id;
  insert into public.finals_qualification_decisions(producer_id,rule_id,place,kind,entry_ids,context,reason) values(roping.producer_id,rule_id,(finish->>'place')::integer,'revoke',array[(finish->>'entryId')::uuid],context,'Rollback-only staff revocation test');
  if (select standings_revision from public.producers where id=roping.producer_id)<=revision then raise exception 'Decision did not invalidate entry eligibility'; end if;
  begin
    insert into public.finals_qualification_decisions(producer_id,rule_id,place,kind,entry_ids,context,reason) values(roping.producer_id,rule_id,(finish->>'place')::integer,'revoke',array[(finish->>'entryId')::uuid],'[]','Stale finish group must be rejected');
  exception when raise_exception then rejected:=true;
  end;
  if not rejected then raise exception 'A stale decision was accepted'; end if;
end;
$$;
rollback;
