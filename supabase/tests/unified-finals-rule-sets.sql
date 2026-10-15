begin;
do $$
declare p uuid; season uuid; slug text; q uuid;
begin
  select s.producer_id,s.id,pr.slug into strict p,season,slug from public.producer_seasons s join public.producers pr on pr.id=s.producer_id limit 1;
  update public.qualification_rule_sets set is_finals=false where producer_id=p;
  insert into public.qualification_rule_sets(producer_id,season_id,name,is_finals,minimum_ropings,top_places)
    values(p,season,'Publication test '||gen_random_uuid()::text,false,5,15) returning id into q;
  if exists(select 1 from public.public_finals_qualification_rules(slug,season) r where r.id=q) then raise exception 'Ordinary rule published as finals'; end if;
  update public.qualification_rule_sets set is_finals=true where id=q;
  if not exists(select 1 from public.public_finals_qualification_rules(slug,season) r where r.id=q and r.minimum_ropings=5 and r.top_places=15) then raise exception 'Finals flag did not publish saved requirements'; end if;
  if exists(select 1 from public.public_finals_qualification_rules(slug,gen_random_uuid()) r where r.id=q) then raise exception 'Publication crossed seasons'; end if;
  update public.qualification_rule_sets set is_finals=false where id=q;
  if exists(select 1 from public.public_finals_qualification_rules(slug,season) r where r.id=q) then raise exception 'Unpublishing retained finals listing'; end if;
  if not exists(select 1 from public.qualification_rule_sets where id=q) then raise exception 'Unpublishing deleted the rule'; end if;
  if exists(select 1 from public.roping_qualification_checks c join public.standings_qualification_rules r on r.producer_id=c.producer_id and r.season_id=c.season_id and r.class_key=c.class_key where c.rule_set_id is null) then raise exception 'Legacy finals assignment was not converted'; end if;
  if exists(select 1 from public.roping_qualification_checks c join public.event_ropings er on er.id=c.event_roping_id join public.qualification_rule_sets r on r.id=c.rule_set_id where r.is_finals and r.class_key is not null and er.qualification_rule_set_id is distinct from r.id) then raise exception 'Converted assignment lost its rule set'; end if;
  if not exists(select 1 from pg_trigger where tgname='validate_roping_qualification_assignment' and tgenabled='O') then raise exception 'Assignment protections not restored'; end if;
end $$;
rollback;
