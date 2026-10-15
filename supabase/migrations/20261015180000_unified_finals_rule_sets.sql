begin;
alter table public.qualification_rule_sets add column if not exists is_finals boolean not null default false;
-- Retain the scope of converted season/class rules. New rule sets apply to the assigned roping's class.
alter table public.qualification_rule_sets add column if not exists class_key text;

lock table public.standings_qualification_rules,public.event_ropings,public.roping_qualification_checks in share row exclusive mode;
create temporary table finals_rule_conversion(producer_id uuid,season_id uuid,class_key text,bonus boolean,rule_id uuid) on commit drop;
do $$
declare old_rule record; bonus boolean; qid uuid; label text; class_label text;
begin
  for old_rule in select r.*,s.name season_name from public.standings_qualification_rules r join public.producer_seasons s on s.id=r.season_id loop
    select coalesce(c.name,d.name||' '||case split_part(old_rule.class_key,':',2) when 'four_d' then '4D' else 'Handicap' end,old_rule.class_key)
      into class_label from (select 1) x left join public.classifications c on c.id::text=old_rule.class_key
      left join public.divisions d on d.id::text=split_part(old_rule.class_key,':',1);
    for bonus in select false union select c.bonus_entries_enabled from public.roping_qualification_checks c
      where c.rule_set_id is null and c.season_id=old_rule.season_id and c.class_key=old_rule.class_key loop
      qid:=gen_random_uuid();
      label:=left('Finals · '||old_rule.season_name||' · '||class_label,75)||case when bonus then ' · Bonus entries' else '' end;
      if exists(select 1 from public.qualification_rule_sets where producer_id=old_rule.producer_id and name=label) then label:=left(label,90)||' '||left(qid::text,8); end if;
      insert into public.qualification_rule_sets(id,producer_id,name,season_id,top_places,minimum_ropings,cutoff_on,attendance_cutoff_on,requirement_match,earned_position_policy,bonus_entries_enabled,is_finals,class_key)
      values(qid,old_rule.producer_id,label,old_rule.season_id,old_rule.top_places,old_rule.minimum_ropings,old_rule.cutoff_on,old_rule.attendance_cutoff_on,'all',old_rule.earned_position_policy,bonus,true,old_rule.class_key);
      insert into finals_rule_conversion values(old_rule.producer_id,old_rule.season_id,old_rule.class_key,bonus,qid);
    end loop;
  end loop;
end $$;
-- Preserve accepted/started ropings' exact requirements, rather than changing their policy.
-- The assignment-validation trigger is restored before this transaction commits.
alter table public.event_ropings disable trigger validate_roping_qualification_assignment;
update public.event_ropings r set qualification_override='custom',qualification_rule_set_id=m.rule_id
from public.roping_qualification_checks c join finals_rule_conversion m on m.producer_id=c.producer_id and m.season_id=c.season_id and m.class_key=c.class_key and m.bonus=c.bonus_entries_enabled
where r.id=c.event_roping_id and c.rule_set_id is null;
alter table public.event_ropings enable trigger validate_roping_qualification_assignment;
update public.roping_qualification_checks c set rule_set_id=q.id,requirement_match=q.requirement_match,earned_position_policy=q.earned_position_policy,rule_updated_at=q.updated_at
from finals_rule_conversion m join public.qualification_rule_sets q on q.id=m.rule_id
where c.rule_set_id is null and c.producer_id=m.producer_id and c.season_id=m.season_id and c.class_key=m.class_key and c.bonus_entries_enabled=m.bonus;
-- Keep prior source revisions: a previously stale check must never become fresh merely through conversion.

create function public.validate_qualification_rule_class() returns trigger language plpgsql set search_path='' as $$
begin
  if new.class_key is not null and not exists(select 1 from public.classifications c where c.id::text=new.class_key and c.producer_id=new.producer_id)
    and not exists(select 1 from public.divisions d where d.producer_id=new.producer_id and new.class_key in(d.id::text||':handicap',d.id::text||':four_d')) then
    raise exception 'Choose a classification belonging to this producer';
  end if;
  return new;
end $$;
create trigger validate_qualification_rule_class before insert or update on public.qualification_rule_sets for each row execute function public.validate_qualification_rule_class();
revoke all on function public.validate_qualification_rule_class() from public,anon,authenticated;

-- Enforce converted class-specific rules when an event rule is used on a different roping.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.save_rule_set_qualification_check(uuid,uuid,bigint,timestamptz,jsonb)'::regprocedure);
  definition:=replace(definition,'if class_key is null then',E'if q.class_key is not null and q.class_key is distinct from class_key then raise exception ''This rule set is restricted to a different classification''; end if;\n  if class_key is null then');
  execute definition;
end $$;

create function public.public_finals_qualification_rules(target_producer_slug text,target_season_id uuid)
returns table(id uuid,name text,class_key text,top_places integer,minimum_ropings integer,cutoff_on date,attendance_cutoff_on date,requirement_match text,earned_position_policy text,bonus_entries_enabled boolean)
language sql stable security definer set search_path='' as $$
  select q.id,q.name,q.class_key,q.top_places,q.minimum_ropings,q.cutoff_on,q.attendance_cutoff_on,q.requirement_match,q.earned_position_policy,q.bonus_entries_enabled
  from public.qualification_rule_sets q join public.producers p on p.id=q.producer_id
  where p.slug=target_producer_slug and q.season_id=target_season_id and q.is_finals order by q.name,q.id;
$$;
revoke all on function public.public_finals_qualification_rules(text,uuid) from public;
grant execute on function public.public_finals_qualification_rules(text,uuid) to anon,authenticated;
-- Retain old records for history, but the retired setup must not create new independent rules.
revoke insert,update,delete on public.standings_qualification_rules from authenticated;
revoke execute on function public.save_finals_qualification_check(uuid,uuid,text,bigint,jsonb,timestamptz,boolean) from authenticated;

commit;
