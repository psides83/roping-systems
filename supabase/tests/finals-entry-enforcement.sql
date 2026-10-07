begin;
do $$
declare owner_id uuid; roping record; season record; member record; updated timestamptz; revision bigint; failure text;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select r.* into strict roping from public.event_ropings r join public.producers p on p.id=r.producer_id
    where p.slug='ultimate-calf-roping' and r.classification_id is not null and r.competition_format not in ('handicap','four_d') limit 1;
  select * into strict season from public.producer_seasons where producer_id=roping.producer_id and roping.scheduled_date between starts_on and ends_on limit 1;
  select * into strict member from public.memberships where producer_id=roping.producer_id limit 1;
  insert into public.standings_qualification_rules(producer_id,season_id,class_key,top_places,minimum_ropings,earned_position_policy)
    values(roping.producer_id,season.id,roping.classification_id::text,10,5,'rank')
    on conflict(season_id,class_key) do update set top_places=10,minimum_ropings=5,earned_position_policy='rank'
    returning updated_at into updated;
  select standings_revision into revision from public.producers where id=roping.producer_id;
  insert into public.roping_qualification_checks(event_roping_id,producer_id,season_id,class_key,source_revision,rule_updated_at,top_places,minimum_ropings,standings)
    values(roping.id,roping.producer_id,season.id,roping.classification_id::text,revision,updated,10,5,
      jsonb_build_array(jsonb_build_object('roperId',member.roper_id,'rank',40,'ropingsEntered',2,'finalsPositions',1)))
    on conflict(event_roping_id) do update set season_id=excluded.season_id,class_key=excluded.class_key,source_revision=excluded.source_revision,rule_updated_at=excluded.rule_updated_at,top_places=excluded.top_places,minimum_ropings=excluded.minimum_ropings,standings=excluded.standings;
  failure:=public.standings_qualification_failure(roping.id,member.roper_id);
  if failure is null then raise exception 'Rank-only bypass incorrectly skipped attendance'; end if;
  update public.roping_qualification_checks set standings=jsonb_build_array(jsonb_build_object('roperId',member.roper_id,'rank',40,'ropingsEntered',5,'finalsPositions',1)) where event_roping_id=roping.id;
  if public.standings_qualification_failure(roping.id,member.roper_id) is not null then raise exception 'Earned position did not bypass rank'; end if;
  update public.standings_qualification_rules set earned_position_policy='rank_and_attendance' where season_id=season.id and class_key=roping.classification_id::text returning updated_at into updated;
  update public.roping_qualification_checks set rule_updated_at=updated,standings=jsonb_build_array(jsonb_build_object('roperId',member.roper_id,'rank',40,'ropingsEntered',0,'finalsPositions',1)) where event_roping_id=roping.id;
  if public.standings_qualification_failure(roping.id,member.roper_id) is not null then raise exception 'Full earned-position bypass failed'; end if;
  update public.producers set standings_revision=standings_revision+1 where id=roping.producer_id;
  if public.standings_qualification_failure(roping.id,member.roper_id) is null then raise exception 'Stale earned-position snapshot incorrectly accepted'; end if;
end;
$$;
rollback;
