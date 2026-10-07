begin;
do $$
declare owner_id uuid; roping record; season record; member record; updated timestamptz; revision bigint; rejected boolean; first_entry uuid; second_entry uuid; third_entry uuid; online record;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select r.* into strict roping from public.event_ropings r join public.producers p on p.id=r.producer_id
    join public.classifications c on c.id=r.classification_id join public.divisions d on d.id=r.division_id
    where p.slug='ultimate-calf-roping' and c.eligibility_type='open' and d.name ilike '%tie%'
    and r.competition_format='standard' and r.event_day_status not in ('in_progress','completed')
    and not exists(select 1 from public.roping_entries e where e.event_roping_id=r.id) limit 1;
  select * into strict season from public.producer_seasons where producer_id=roping.producer_id and roping.scheduled_date between starts_on and ends_on limit 1;
  select m.*,r.email into strict member from public.memberships m join public.ropers r on r.id=m.roper_id where m.producer_id=roping.producer_id and m.status='active' limit 1;
  update public.event_ropings set max_entries_per_roper=1 where id=roping.id;
  update public.events set is_public=true,publication_state='published' where id=roping.event_id;
  insert into public.standings_qualification_rules(producer_id,season_id,class_key,top_places,minimum_ropings,earned_position_policy)
    values(roping.producer_id,season.id,roping.classification_id::text,10,5,'rank')
    on conflict(season_id,class_key) do update set top_places=10,minimum_ropings=5,earned_position_policy='rank' returning updated_at into updated;
  select standings_revision into revision from public.producers where id=roping.producer_id;
  perform public.save_roping_qualification_check_with_bonus(roping.id,season.id,roping.classification_id::text,revision,
    jsonb_build_array(jsonb_build_object('roperId',member.roper_id,'rank',40,'ropingsEntered',5,'finalsPositions',2)),updated,true);
  if public.roping_entry_allowance(roping.id,member.roper_id)<>3 then raise exception 'One regular plus two bonus positions did not allow three entries'; end if;
  select * into strict online from public.online_finals_entry_allowances('ultimate-calf-roping',(select slug from public.events where id=roping.event_id),member.member_number,member.email) where event_roping_id=roping.id;
  if online.normal_entries<>1 or online.bonus_entries<>2 or online.remaining_entries<>3 then raise exception 'Online allowance differs from staff allowance'; end if;
  first_entry:=public.create_event_entry_with_eligibility_override(roping.id,member.roper_id,'office','unpaid',null);
  second_entry:=public.create_event_entry_with_eligibility_override(roping.id,member.roper_id,'office','unpaid',null);
  third_entry:=public.create_event_entry_with_eligibility_override(roping.id,member.roper_id,'office','unpaid',null);
  rejected:=false;
  begin perform public.create_event_entry_with_eligibility_override(roping.id,member.roper_id,'office','unpaid',null); exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'A fourth entry exceeded the allowance'; end if;
  update public.roping_entries set competition_status='withdrawn' where id=first_entry;
  perform public.create_event_entry_with_eligibility_override(roping.id,member.roper_id,'office','unpaid',null);
  rejected:=false;
  begin update public.roping_entries set competition_status='active' where id=first_entry; exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Reinstatement exceeded the allowance'; end if;
  update public.roping_qualification_checks set standings=jsonb_build_array(jsonb_build_object('roperId',member.roper_id,'rank',40,'ropingsEntered',0,'finalsPositions',2)) where event_roping_id=roping.id;
  if public.roping_entry_allowance(roping.id,member.roper_id)<>1 then raise exception 'Bonus entries incorrectly bypassed required attendance'; end if;
  update public.standings_qualification_rules set earned_position_policy='rank_and_attendance' where season_id=season.id and class_key=roping.classification_id::text returning updated_at into updated;
  update public.roping_qualification_checks set rule_updated_at=updated where event_roping_id=roping.id;
  if public.roping_entry_allowance(roping.id,member.roper_id)<>3 then raise exception 'Optional attendance bypass did not apply'; end if;
  update public.roping_qualification_checks set bonus_entries_enabled=false where event_roping_id=roping.id;
  if public.roping_entry_allowance(roping.id,member.roper_id)<>1 then raise exception 'Non-finals entries used bonus positions'; end if;
end;
$$;
rollback;
