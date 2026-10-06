begin;
select set_config('request.jwt.claim.sub','2d940f25-84d8-4eb1-a260-2bb76717cfda',true);
do $$
declare
  r public.event_ropings%rowtype;
  s public.producer_seasons%rowtype;
  q public.standings_qualification_rules%rowtype;
  revision bigint;
  notice jsonb;
begin
  select * into strict r from public.event_ropings
    where event_id='0405a4f6-bdf6-49d6-af75-7f665006308b' and classification_id is not null
    and competition_format='standard' order by id limit 1;
  select * into strict s from public.producer_seasons where producer_id=r.producer_id order by starts_on desc limit 1;
  insert into public.standings_qualification_rules(producer_id,season_id,class_key,top_places,minimum_ropings)
    values(r.producer_id,s.id,r.classification_id::text,10,5)
    on conflict(season_id,class_key) do update set top_places=10,minimum_ropings=5 returning * into q;
  select standings_revision into revision from public.producers where id=r.producer_id;
  perform public.save_roping_qualification_check(r.id,s.id,r.classification_id::text,revision,'[]'::jsonb,q.updated_at);
  select to_jsonb(n) into strict notice from public.public_roping_qualification_notices('ultimate-calf-roping',r.event_id) n
    where n.event_roping_id=r.id;
  if notice->>'requirements_available'<>'true' or (notice->>'top_places')::int<>10 then raise exception 'Incorrect notice'; end if;
  if notice ? 'standings' or notice ? 'checked_by' then raise exception 'Private qualification fields exposed'; end if;
  if exists(select 1 from public.public_roping_qualification_notices('another-producer',r.event_id)) then raise exception 'Tenant leak'; end if;
  delete from public.standings_qualification_rules where season_id=s.id and class_key=r.classification_id::text;
  if exists(select 1 from public.public_roping_qualification_notices('ultimate-calf-roping',r.event_id) n
    where n.event_roping_id=r.id and n.requirements_available) then raise exception 'Missing rule still advertised'; end if;
  update public.events set is_public=false where id=r.event_id;
  if exists(select 1 from public.public_roping_qualification_notices('ultimate-calf-roping',r.event_id)) then raise exception 'Private event exposed'; end if;
end;
$$;
set local role anon;
select * from public.public_roping_qualification_notices('ultimate-calf-roping',null);
rollback;
