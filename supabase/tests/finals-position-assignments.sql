begin;
do $$
declare owner_id uuid; target record; season record; membership uuid; award uuid; expired_season uuid; expired_award uuid;
  second_target uuid; revision bigint; updated timestamptz; today date; rejected boolean;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select r.* into strict target from public.event_ropings r join public.producers p on p.id=r.producer_id
    join public.events e on e.id=r.event_id join public.classifications c on c.id=r.classification_id
    where p.slug='ultimate-calf-roping' and c.eligibility_type='open' and r.competition_format='standard'
    and r.event_day_status not in ('in_progress','completed') and e.status not in ('completed','cancelled')
    and r.scheduled_date >= (now() at time zone p.timezone)::date and r.roping_template_id is not null
    and not exists(select 1 from public.roping_entries x where x.event_roping_id=r.id) limit 1;
  select (now() at time zone timezone)::date into today from public.producers where id=target.producer_id;
  select * into strict season from public.producer_seasons where producer_id=target.producer_id and today between starts_on and ends_on limit 1;
  select id into strict membership from public.memberships where producer_id=target.producer_id and status='active' limit 1;
  insert into public.manual_finals_positions(producer_id,season_id,membership_id,class_key,awarded_on,positions,reason)
    values(target.producer_id,season.id,membership,target.classification_id::text,today,2,'Rollback-only assignment test') returning id into award;
  insert into public.standings_qualification_rules(producer_id,season_id,class_key,minimum_ropings,earned_position_policy)
    values(target.producer_id,season.id,target.classification_id::text,0,'rank_and_attendance')
    on conflict(season_id,class_key) do update set minimum_ropings=0,earned_position_policy='rank_and_attendance' returning updated_at into updated;
  second_target:=public.add_roping_to_event(target.event_id,target.roping_template_id,target.classification_id,target.scheduled_date,'fixed',target.scheduled_date+time '09:00',null,target.arena_name,null,false);
  select standings_revision into revision from public.producers where id=target.producer_id;
  perform public.save_roping_qualification_check_with_bonus(target.id,season.id,target.classification_id::text,revision,'[]'::jsonb,updated,true);
  perform public.save_roping_qualification_check_with_bonus(second_target,season.id,target.classification_id::text,revision,'[]'::jsonb,updated,true);
  perform public.assign_finals_position(target.producer_id,season.id,membership,'manual:'||award,1,target.classification_id::text,target.id,revision,'Assign first target');
  rejected:=false;
  begin perform public.assign_finals_position(target.producer_id,season.id,membership,'manual:'||award,1,target.classification_id::text,second_target,revision,'Stale second request'); exception when raise_exception then
    if sqlerrm not like '%Refresh%' then raise; end if; rejected:=true;
  end;
  if not rejected then raise exception 'Stale assignment request was accepted'; end if;
  select standings_revision into revision from public.producers where id=target.producer_id;
  perform public.assign_finals_position(target.producer_id,season.id,membership,'manual:'||award,1,target.classification_id::text,second_target,revision,'Move to second target');
  if (select count(*) from public.finals_position_assignments where award_key='manual:'||award)<>1
    or not exists(select 1 from public.finals_position_assignments where award_key='manual:'||award and event_roping_id=second_target) then raise exception 'One position was assigned to multiple targets'; end if;
  select standings_revision into revision from public.producers where id=target.producer_id;
  rejected:=false;
  begin perform public.assign_finals_position(target.producer_id,season.id,membership,'manual:'||award||':alias',1,target.classification_id::text,target.id,revision,'Attempt duplicated identity'); exception when raise_exception then
    if sqlerrm not like '%identity%' then raise; end if; rejected:=true;
  end;
  if not rejected then raise exception 'An alias duplicated an earned position'; end if;
  update public.event_ropings set event_day_status='in_progress' where id=second_target;
  select standings_revision into revision from public.producers where id=target.producer_id;
  rejected:=false;
  begin perform public.assign_finals_position(target.producer_id,season.id,membership,'manual:'||award,1,target.classification_id::text,target.id,revision,'Move after start'); exception when raise_exception then
    if sqlerrm not like '%starts%' then raise; end if; rejected:=true;
  end;
  if not rejected then raise exception 'Started target allowed reassignment'; end if;
  insert into public.producer_seasons(producer_id,name,starts_on,ends_on) values(target.producer_id,'Rollback-only expired season','2000-01-01','2000-12-31') returning id into expired_season;
  insert into public.manual_finals_positions(producer_id,season_id,membership_id,class_key,awarded_on,positions,reason)
    values(target.producer_id,expired_season,membership,target.classification_id::text,'2000-06-01',1,'Rollback-only expired position') returning id into expired_award;
  select standings_revision into revision from public.producers where id=target.producer_id;
  rejected:=false;
  begin perform public.assign_finals_position(target.producer_id,expired_season,membership,'manual:'||expired_award,1,target.classification_id::text,target.id,revision,'Attempt expired assignment'); exception when raise_exception then
    if sqlerrm not like '%expired%' then raise; end if; rejected:=true;
  end;
  if not rejected then raise exception 'Expired position was assigned'; end if;
  if has_table_privilege('authenticated','public.finals_position_assignments','INSERT') or has_table_privilege('anon','public.finals_position_assignments','SELECT') then raise exception 'Assignment ledger privileges are too broad'; end if;
end;
$$;
rollback;
