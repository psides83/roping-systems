begin;
do $$
declare source public.event_ropings%rowtype; season public.producer_seasons%rowtype; original public.events%rowtype;
  staff uuid; new_event uuid:=gen_random_uuid(); new_roping uuid:=gen_random_uuid(); rule_id uuid;
  rule_revision timestamptz; revision bigint; payload jsonb; member_id uuid:=gen_random_uuid(); notice record; membership public.memberships%rowtype; context jsonb;
begin
  select r.* into strict source from public.event_ropings r where r.classification_id is not null and r.competition_format='standard'
    and exists(select 1 from public.producer_staff s where s.producer_id=r.producer_id and s.role='owner') limit 1;
  select user_id into strict staff from public.producer_staff where producer_id=source.producer_id and role='owner' limit 1;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  select * into strict season from public.producer_seasons where producer_id=source.producer_id limit 1;
  select * into strict original from public.events where id=source.event_id;
  insert into public.qualification_rule_sets(producer_id,name,season_id,top_places,minimum_ropings,cutoff_on,attendance_cutoff_on)
    values(source.producer_id,'Independent cutoffs '||gen_random_uuid(),season.id,5,10,season.starts_on,season.ends_on)
    returning id,updated_at into rule_id,rule_revision;
  begin
    update public.qualification_rule_sets set attendance_cutoff_on=season.ends_on+1 where id=rule_id;
    raise exception 'Out-of-season attendance cutoff allowed';
  exception when raise_exception then if sqlerrm not like '%within that season%' then raise; end if; end;
  payload:=to_jsonb(original)||jsonb_build_object('id',new_event,'slug','cutoffs-'||new_event,'status','scheduled',
    'publication_state','published','is_public',true,'result_status','unofficial','qualification_rule_set_id',rule_id);
  insert into public.events select * from jsonb_populate_record(null::public.events,payload);
  payload:=to_jsonb(source)||jsonb_build_object('id',new_roping,'event_id',new_event,'event_day_status','scheduled',
    'result_status','unofficial','qualification_override','inherit','qualification_rule_set_id',null);
  insert into public.event_ropings select * from jsonb_populate_record(null::public.event_ropings,payload);
  select standings_revision into revision from public.producers where id=source.producer_id;
  perform public.save_rule_set_qualification_check(new_roping,rule_id,revision,rule_revision,
    jsonb_build_array(jsonb_build_object('roperId',member_id,'rank',1,'ropingsEntered',10)));
  if not exists(select 1 from public.roping_qualification_checks where event_roping_id=new_roping
    and cutoff_on=season.starts_on and attendance_cutoff_on=season.ends_on) then raise exception 'Independent deadlines not saved in eligibility snapshot'; end if;
  if public.standings_qualification_failure(new_roping,member_id) is not null then raise exception 'Independent qualification cache rejected eligible roper'; end if;
  select * into strict notice from public.public_qualification_rule_set_notices((select slug from public.producers where id=source.producer_id),new_event);
  if notice.cutoff_on<>season.starts_on or notice.attendance_cutoff_on<>season.ends_on then raise exception 'Public notices lost one deadline'; end if;
  update public.qualification_rule_sets set attendance_cutoff_on=season.starts_on where id=rule_id returning updated_at into rule_revision;
  if public.standings_qualification_failure(new_roping,member_id) is null then raise exception 'Attendance deadline change did not invalidate cached eligibility'; end if;
  perform public.save_rule_set_qualification_check(new_roping,rule_id,revision,rule_revision,
    jsonb_build_array(jsonb_build_object('roperId',member_id,'rank',1,'ropingsEntered',1)));
  if public.standings_qualification_failure(new_roping,member_id) is null then raise exception 'Updated attendance requirement not enforced'; end if;
  update public.qualification_rule_sets set cutoff_on=season.ends_on,attendance_cutoff_on=season.starts_on where id=rule_id;
  update public.qualification_rule_sets set cutoff_on=null,attendance_cutoff_on=null where id=rule_id;
  insert into public.standings_qualification_rules(producer_id,season_id,class_key,cutoff_on,attendance_cutoff_on)
    values(source.producer_id,season.id,source.classification_id::text,season.starts_on,season.ends_on)
    on conflict(season_id,class_key) do update set cutoff_on=excluded.cutoff_on,attendance_cutoff_on=excluded.attendance_cutoff_on;
  if not exists(select 1 from public.public_standings_qualification_rules((select slug from public.producers where id=source.producer_id),season.id)
    where class_key=source.classification_id::text and cutoff_on=season.starts_on and attendance_cutoff_on=season.ends_on) then raise exception 'Class-level public requirements lost independent dates'; end if;
  select * into strict membership from public.memberships where producer_id=source.producer_id limit 1;
  update public.ropers set auth_user_id=null where auth_user_id=staff;
  update public.ropers set auth_user_id=staff where id=membership.roper_id;
  context:=public.my_roper_standings_context(membership.id,season.id);
  if not exists(select 1 from jsonb_array_elements(context->'requirements') q where q->>'classId'=source.classification_id::text
    and q->>'cutoffOn'=season.starts_on::text and q->>'attendanceCutoffOn'=season.ends_on::text) then raise exception 'Private roper context lost independent deadlines'; end if;
  begin
    update public.standings_qualification_rules set attendance_cutoff_on=season.starts_on-1
      where season_id=season.id and class_key=source.classification_id::text;
    raise exception 'Out-of-season class attendance deadline allowed';
  exception when raise_exception then if sqlerrm not like '%within that season%' then raise; end if; end;
end; $$;
rollback;
