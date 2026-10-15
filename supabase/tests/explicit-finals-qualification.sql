begin;
do $$
declare p uuid; staff uuid; source public.event_ropings%rowtype; r uuid:=gen_random_uuid(); season uuid;
  event_copy public.events%rowtype; test_event uuid:=gen_random_uuid(); key text; stamp timestamptz; revision bigint; q uuid; rejected boolean;
begin
  select er.* into strict source from public.event_ropings er join public.events e on e.id=er.event_id
    where e.status not in ('in_progress','completed','cancelled') and (er.classification_id is not null or er.competition_format in ('handicap','four_d')) and exists(select 1 from public.producer_staff s where s.producer_id=er.producer_id and s.role='owner')
    and exists(select 1 from public.producer_seasons s where s.producer_id=er.producer_id) limit 1;
  p:=source.producer_id;
  select user_id into strict staff from public.producer_staff where producer_id=p and role='owner' limit 1;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  select id into strict season from public.producer_seasons where producer_id=p limit 1;
  select * into strict event_copy from public.events where id=source.event_id;
  insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(event_copy)||jsonb_build_object('id',test_event,'slug','finals-separation-'||test_event::text,'qualification_rule_set_id',null))).*;
  insert into public.event_ropings select (jsonb_populate_record(null::public.event_ropings,to_jsonb(source)||jsonb_build_object('id',r,'event_id',test_event,'name','Finals separation test','event_day_status','scheduled','qualification_override','inherit','qualification_rule_set_id',null))).*;
  key:=case when source.competition_format in ('handicap','four_d') then source.division_id::text||':'||source.competition_format else source.classification_id::text end;
  if key is null then raise exception 'Classified roping fixture required'; end if;
  insert into public.standings_qualification_rules(producer_id,season_id,class_key,minimum_ropings) values(p,season,key,0)
    on conflict(season_id,class_key) do update set minimum_ropings=0;
  select updated_at into stamp from public.standings_qualification_rules where season_id=season and class_key=key;
  select standings_revision into revision from public.producers where id=p;
  insert into public.qualification_rule_sets(producer_id,name,season_id) values(p,'Non-finals separation test',season) returning id into q;
  perform public.save_qualification_assignment(test_event,null,'custom',q);
  select standings_revision into revision from public.producers where id=p;
  if public.effective_qualification_rule_set(r) is distinct from q then raise exception 'Non-finals inheritance failed'; end if;
  rejected:=false;
  begin perform public.save_finals_qualification_check(r,season,key,revision,'[]',stamp-interval '1 day',false);
  exception when others then rejected:=true; end;
  if not rejected or public.effective_qualification_rule_set(r) is distinct from q then raise exception 'Failed finals save changed assignment'; end if;
  perform public.save_finals_qualification_check(r,season,key,revision,'[]',stamp,false);
  if public.effective_qualification_rule_set(r) is not null or not exists(select 1 from public.event_ropings where id=r and qualification_override='finals') then raise exception 'Finals did not bypass event rule set'; end if;
  if not exists(select 1 from public.roping_qualification_checks where event_roping_id=r and rule_set_id is null and season_id=season) then raise exception 'Finals check not saved'; end if;
  perform public.save_qualification_assignment(test_event,null,'none',null);
  if not exists(select 1 from public.roping_qualification_checks where event_roping_id=r and season_id=season) then raise exception 'Non-finals event change removed finals qualification'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  rejected:=false;
  begin perform public.save_finals_qualification_check(r,null,null,0,'[]',null,false);
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Unauthorized finals change accepted'; end if;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  perform public.save_finals_qualification_check(r,null,null,0,'[]',null,false);
  if exists(select 1 from public.roping_qualification_checks where event_roping_id=r) then raise exception 'Finals opt-out retained check'; end if;
end $$;
rollback;
