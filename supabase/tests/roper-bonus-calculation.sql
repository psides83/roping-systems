begin;
create temporary table portal_bonus_check(payload jsonb);
do $$
declare account uuid; member public.memberships%rowtype; other uuid; season public.producer_seasons%rowtype; producer public.producers%rowtype; classification uuid; source jsonb; portal jsonb;
begin
  select id into strict account from auth.users where lower(email)='psides83@hotmail.com';
  select m.* into strict member from public.memberships m join public.producers p on p.id=m.producer_id where p.slug='ultimate-calf-roping' limit 1;
  select * into strict producer from public.producers where id=member.producer_id;
  select * into strict season from public.producer_seasons where producer_id=producer.id order by starts_on desc limit 1;
  select id into strict classification from public.classifications where producer_id=producer.id limit 1;
  select id into strict other from public.memberships where producer_id=producer.id and id<>member.id limit 1;
  perform set_config('request.jwt.claim.sub',account::text,true);
  update public.ropers set auth_user_id=null where auth_user_id=account;
  update public.ropers set auth_user_id=account where id=member.roper_id;
  insert into public.manual_finals_positions(producer_id,season_id,membership_id,class_key,awarded_on,positions,reason) values
    (producer.id,season.id,member.id,classification::text,season.starts_on,2,'Rollback-only own portal award'),
    (producer.id,season.id,other,classification::text,season.starts_on,2,'Rollback-only other portal award');
  source:=public.portal_finals_source_internal(producer.slug,season.id);
  portal:=public.my_roper_bonus_positions(member.id,season.id);
  insert into portal_bonus_check values(jsonb_build_object('canonical',source,'portal',portal));
end;
$$;
select payload from portal_bonus_check;
rollback;
