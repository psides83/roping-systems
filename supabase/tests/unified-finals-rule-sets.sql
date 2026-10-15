begin;
do $$
declare p uuid; season uuid; slug text; q uuid; old_count integer;
begin
  select s.producer_id,s.id,pr.slug into strict p,season,slug from public.producer_seasons s join public.producers pr on pr.id=s.producer_id limit 1;
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
  if exists(select 1 from public.standings_qualification_rules old where not exists(select 1 from public.qualification_rule_sets q where q.producer_id=old.producer_id and q.season_id=old.season_id and q.class_key=old.class_key and q.is_finals and q.top_places is not distinct from old.top_places and q.minimum_ropings=old.minimum_ropings and q.cutoff_on is not distinct from old.cutoff_on and q.attendance_cutoff_on is not distinct from old.attendance_cutoff_on and q.earned_position_policy=old.earned_position_policy)) then raise exception 'Converted rules changed requirements'; end if;
  if exists(select 1 from public.roping_qualification_checks c join public.qualification_rule_sets q on q.id=c.rule_set_id where q.class_key is not null and c.bonus_entries_enabled is distinct from q.bonus_entries_enabled) then raise exception 'Converted rules changed bonus allowance'; end if;
  select count(*) into old_count from public.standings_qualification_rules;
  if old_count > 0 and not exists(select 1 from public.qualification_rule_sets where is_finals and class_key is not null) then raise exception 'Legacy finals rules were not preserved'; end if;
  if not exists(select 1 from pg_trigger where tgname='validate_roping_qualification_assignment' and tgenabled='O') then raise exception 'Assignment protections not restored'; end if;
end $$;
rollback;
