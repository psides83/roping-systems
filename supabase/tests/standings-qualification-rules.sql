begin;
select set_config('request.jwt.claim.sub','2d940f25-84d8-4eb1-a260-2bb76717cfda',true);
set local role authenticated;
do $$
declare
  season public.producer_seasons%rowtype;
  class_id uuid;
begin
  select s.* into strict season from public.producer_seasons s
  join public.producers p on p.id=s.producer_id where p.slug='ultimate-calf-roping'
  order by s.starts_on desc limit 1;
  select id into strict class_id from public.classifications where producer_id=season.producer_id order by rank desc limit 1;
  insert into public.standings_qualification_rules(producer_id,season_id,class_key,top_places,minimum_ropings,cutoff_on)
  values(season.producer_id,season.id,class_id::text,10,4,season.ends_on)
  on conflict(season_id,class_key) do update set top_places=10,minimum_ropings=4,cutoff_on=season.ends_on;
  if not exists(select 1 from public.public_standings_qualification_rules('ultimate-calf-roping',season.id)
    where class_key=class_id::text and top_places=10 and minimum_ropings=4) then
    raise exception 'Public requirements do not match saved rules';
  end if;
  begin
    update public.standings_qualification_rules set cutoff_on=season.ends_on+1
    where season_id=season.id and class_key=class_id::text;
    raise exception 'Invalid cutoff accepted';
  exception when others then
    if sqlerrm='Invalid cutoff accepted' then raise; end if;
  end;
  if exists(select 1 from public.public_standings_qualification_rules('other-producer',season.id)) then
    raise exception 'Rules leaked across producers';
  end if;
end;
$$;
rollback;
