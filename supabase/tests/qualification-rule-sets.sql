begin;
do $$
declare source public.event_ropings%rowtype; original public.events%rowtype; owner_id uuid;
  new_event uuid:=gen_random_uuid(); new_roping uuid:=gen_random_uuid(); rule_id uuid; rule_revision timestamptz;
  season_id uuid; roper_id uuid:=gen_random_uuid(); revision bigint; payload jsonb; failure text; created_event uuid;
begin
  select r.* into source from public.event_ropings r
    where r.classification_id is not null and r.competition_format='standard' and r.roping_template_id is not null
      and exists(select 1 from public.roping_templates t where t.id=r.roping_template_id and t.is_active)
      and exists(select 1 from public.producer_staff s where s.producer_id=r.producer_id and s.role='owner') limit 1;
  if source.id is null then raise exception 'A classified test roping is required'; end if;
  select user_id into owner_id from public.producer_staff where producer_id=source.producer_id and role='owner' limit 1;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select * into original from public.events where id=source.event_id;
  select id into season_id from public.producer_seasons where producer_id=source.producer_id limit 1;
  if season_id is null then raise exception 'A test season is required'; end if;
  insert into public.qualification_rule_sets(producer_id,name,season_id,top_places,minimum_ropings,requirement_match)
    values(source.producer_id,'Rule-set test '||gen_random_uuid(),season_id,15,10,'all') returning id,updated_at into rule_id,rule_revision;
  payload:=to_jsonb(original)||jsonb_build_object('id',new_event,'slug','rules-test-'||new_event,'status','draft','publication_state','draft','result_status','unofficial','qualification_rule_set_id',null);
  insert into public.events select * from jsonb_populate_record(null::public.events,payload);
  payload:=to_jsonb(source)||jsonb_build_object('id',new_roping,'event_id',new_event,'event_day_status','scheduled','result_status','unofficial','qualification_override','inherit','qualification_rule_set_id',null);
  insert into public.event_ropings select * from jsonb_populate_record(null::public.event_ropings,payload);
  perform public.save_qualification_assignment(new_event,null,'custom',rule_id);
  if public.effective_qualification_rule_set(new_roping) is distinct from rule_id then raise exception 'Event inheritance failed'; end if;
  if public.standings_qualification_failure(new_roping,roper_id) is null then raise exception 'Missing cache must block qualified entries'; end if;
  select standings_revision into revision from public.producers where id=source.producer_id;
  perform public.save_rule_set_qualification_check(new_roping,rule_id,revision,rule_revision,
    jsonb_build_array(jsonb_build_object('roperId',roper_id,'rank',8,'ropingsEntered',1,'finalsPositions',0)));
  if public.standings_qualification_failure(new_roping,roper_id) is null then raise exception 'ALL must require attendance'; end if;
  update public.qualification_rule_sets set requirement_match='any' where id=rule_id returning updated_at into rule_revision;
  if public.standings_qualification_failure(new_roping,roper_id) is null then raise exception 'Changed rules must invalidate the check'; end if;
  perform public.save_rule_set_qualification_check(new_roping,rule_id,revision,rule_revision,
    jsonb_build_array(jsonb_build_object('roperId',roper_id,'rank',8,'ropingsEntered',1,'finalsPositions',0)));
  failure:=public.standings_qualification_failure(new_roping,roper_id);
  if failure is not null then raise exception 'ANY should accept rank: %',failure; end if;
  perform public.save_rule_set_qualification_check(new_roping,rule_id,revision,rule_revision,
    jsonb_build_array(jsonb_build_object('roperId',roper_id,'rank',9007199254740991,'ropingsEntered',10,'finalsPositions',2)));
  if public.standings_qualification_failure(new_roping,roper_id) is not null then raise exception 'Bonus-only sentinel ranks must not overflow and should qualify on attendance'; end if;
  perform public.save_qualification_assignment(new_event,new_roping,'none',null);
  if public.effective_qualification_rule_set(new_roping) is not null or public.standings_qualification_failure(new_roping,roper_id) is not null then raise exception 'Opt-out failed'; end if;
  perform public.save_qualification_assignment(new_event,new_roping,'custom',rule_id);
  if public.effective_qualification_rule_set(new_roping) is distinct from rule_id then raise exception 'Custom rule assignment failed'; end if;
  created_event:=public.create_event_with_qualification(source.producer_id,jsonb_build_object(
    'event_title','Qualification creation test','event_slug','creation-test-'||gen_random_uuid(),
    'event_venue_name','Test Arena','event_address','','event_city','Hamilton','event_state','TX','event_postal_code','76531',
    'event_starts_at_local',to_char(now()+interval '30 days','YYYY-MM-DD')||'T09:00',
    'event_publication_state','draft','arena_count',2,'event_fee_title','',
    'event_class_occurrences',jsonb_build_array(jsonb_build_object(
      'templateId',source.roping_template_id,'classificationId',source.classification_id,
      'scheduledDate',to_char(now()+interval '30 days','YYYY-MM-DD'),'scheduleType','fixed',
      'startsAt',to_char(now()+interval '30 days','YYYY-MM-DD')||'T09:00','scheduleNote','',
      'arenaName','Arena 1','roundCount',1,'cattleDrawEnabled',false,'incentiveEnabled',false,
      'incentiveRules','[]'::jsonb,'maleEligibilityPolicy','producer_default'
    ))
  ),rule_id);
  if not exists(select 1 from public.events where id=created_event and qualification_rule_set_id=rule_id and arena_count=2) then raise exception 'Atomic event setup did not retain qualification and arena settings'; end if;
  if not exists(select 1 from public.event_ropings r where r.event_id=created_event and public.effective_qualification_rule_set(r.id)=rule_id) then raise exception 'Created roping did not inherit qualification'; end if;
  update public.event_ropings set event_day_status='in_progress' where id=new_roping;
  begin
    perform public.save_qualification_assignment(new_event,new_roping,'none',null);
    raise exception 'Started roping unexpectedly permitted qualification changes';
  exception when raise_exception then
    if sqlerrm='Started roping unexpectedly permitted qualification changes' then raise; end if;
  end;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  begin
    perform public.save_qualification_assignment(new_event,null,'none',null);
    raise exception 'Nonstaff unexpectedly changed qualification';
  exception when raise_exception then
    if sqlerrm='Nonstaff unexpectedly changed qualification' then raise; end if;
  end;
  if exists(select 1 from public.public_qualification_rule_set_notices((select slug from public.producers where id=source.producer_id),new_event)) then raise exception 'Draft event requirements leaked publicly'; end if;
end; $$;
rollback;
