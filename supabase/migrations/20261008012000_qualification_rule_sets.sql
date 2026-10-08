create table public.qualification_rule_sets (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete cascade,
  name text not null check(length(trim(name)) between 1 and 100),
  season_id uuid not null references public.producer_seasons(id),
  top_places integer check(top_places > 0),
  minimum_ropings integer not null default 0 check(minimum_ropings >= 0),
  cutoff_on date,
  requirement_match text not null default 'all' check(requirement_match in ('all','any')),
  earned_position_policy text not null default 'none' check(earned_position_policy in ('none','rank','rank_and_attendance')),
  bonus_entries_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  unique(producer_id,name)
);
alter table public.qualification_rule_sets enable row level security;
grant select,insert,update,delete on public.qualification_rule_sets to authenticated;
create policy "Staff read qualification rule sets" on public.qualification_rule_sets for select to authenticated using(public.has_organization_access(producer_id));
create policy "Managers manage qualification rule sets" on public.qualification_rule_sets for all to authenticated using(public.can_manage_organization(producer_id)) with check(public.can_manage_organization(producer_id));
alter table public.events add column qualification_rule_set_id uuid references public.qualification_rule_sets(id);
alter table public.event_ropings add column qualification_override text not null default 'inherit' check(qualification_override in ('inherit','none','custom'));
alter table public.event_ropings add column qualification_rule_set_id uuid references public.qualification_rule_sets(id);
alter table public.roping_qualification_checks add column rule_set_id uuid references public.qualification_rule_sets(id);
alter table public.roping_qualification_checks add column requirement_match text not null default 'all' check(requirement_match in ('all','any'));
alter table public.roping_qualification_checks add column earned_position_policy text not null default 'none' check(earned_position_policy in ('none','rank','rank_and_attendance'));

create function public.validate_qualification_rule_set() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.producer_seasons s where s.id=new.season_id and s.producer_id=new.producer_id
    and (new.cutoff_on is null or new.cutoff_on between s.starts_on and s.ends_on)) then
    raise exception 'Choose a season and cutoff date belonging to this producer';
  end if;
  if tg_op='UPDATE' and new.producer_id<>old.producer_id then raise exception 'A rule set cannot change producer'; end if;
  new.updated_at:=clock_timestamp();
  return new;
end; $$;
create trigger validate_qualification_rule_set before insert or update on public.qualification_rule_sets for each row execute function public.validate_qualification_rule_set();
create trigger audit_qualification_rule_sets after insert or update or delete on public.qualification_rule_sets for each row execute function public.write_audit_log();

create function public.effective_qualification_rule_set(target_roping_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select case r.qualification_override when 'none' then null when 'custom' then r.qualification_rule_set_id else e.qualification_rule_set_id end
  from public.event_ropings r join public.events e on e.id=r.event_id and e.producer_id=r.producer_id where r.id=target_roping_id;
$$;
revoke all on function public.effective_qualification_rule_set(uuid) from public,anon,authenticated;

-- Preserve existing per-class rules until a producer explicitly replaces them.
alter function public.standings_qualification_failure(uuid,uuid) rename to legacy_standings_qualification_failure;
create function public.standings_qualification_failure(target_roping_id uuid,target_roper_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare rule public.qualification_rule_sets%rowtype; checked public.roping_qualification_checks%rowtype;
  item jsonb; revision bigint; attendance boolean; ranking boolean; mode text; class_key text;
begin
  select r.qualification_override,case when r.competition_format in ('handicap','four_d') then r.division_id::text||':'||r.competition_format else r.classification_id::text end
    into mode,class_key from public.event_ropings r where r.id=target_roping_id for share;
  if mode='none' then return null; end if;
  select * into rule from public.qualification_rule_sets where id=public.effective_qualification_rule_set(target_roping_id);
  if rule.id is null then return public.legacy_standings_qualification_failure(target_roping_id,target_roper_id); end if;
  select standings_revision into revision from public.producers where id=rule.producer_id for share;
  select * into checked from public.roping_qualification_checks where event_roping_id=target_roping_id;
  if checked.rule_set_id is distinct from rule.id or checked.source_revision is distinct from revision
    or checked.rule_updated_at is distinct from rule.updated_at or checked.class_key is distinct from class_key then
    return 'Qualification information changed. A manager must refresh the qualification check before accepting entries';
  end if;
  select value into item from jsonb_array_elements(checked.standings) where value->>'roperId'=target_roper_id::text;
  attendance:=coalesce((item->>'ropingsEntered')::integer,0)>=rule.minimum_ropings;
  ranking:=rule.top_places is null or coalesce((item->>'rank')::integer,2147483647)<=rule.top_places;
  if coalesce((item->>'finalsPositions')::integer,0)>0 then
    if rule.earned_position_policy='rank_and_attendance' or rule.earned_position_policy='rank' and attendance then return null; end if;
  end if;
  if rule.requirement_match='any' then
    if (rule.minimum_ropings>0 and attendance) or (rule.top_places is not null and ranking)
      or (rule.minimum_ropings=0 and rule.top_places is null) then return null; end if;
  elsif attendance and ranking then return null;
  end if;
  return 'Contestant does not meet this roping qualification rule set';
end; $$;
revoke all on function public.standings_qualification_failure(uuid,uuid) from public,anon,authenticated;

create function public.save_rule_set_qualification_check(target_roping_id uuid,target_rule_set_id uuid,
  expected_revision bigint,expected_rule_updated_at timestamptz,target_standings jsonb)
returns void language plpgsql security definer set search_path='' as $$
declare r public.event_ropings%rowtype; q public.qualification_rule_sets%rowtype; revision bigint; class_key text;
begin
  select * into r from public.event_ropings where id=target_roping_id for update;
  if r.id is null or not public.can_manage_event_roping(r.id) then raise exception 'Roping management access is required'; end if;
  select * into q from public.qualification_rule_sets where id=target_rule_set_id and producer_id=r.producer_id for share;
  if q.id is null or public.effective_qualification_rule_set(r.id) is distinct from q.id or q.updated_at is distinct from expected_rule_updated_at then raise exception 'Qualification setup changed. Reload and try again'; end if;
  select standings_revision into revision from public.producers where id=r.producer_id for update;
  if revision<>expected_revision then raise exception 'Standings changed. Refresh and try again'; end if;
  if jsonb_typeof(target_standings) is distinct from 'array' or jsonb_array_length(target_standings)>100000 then raise exception 'Invalid qualification standings'; end if;
  class_key:=case when r.competition_format in ('handicap','four_d') then r.division_id::text||':'||r.competition_format else r.classification_id::text end;
  if class_key is null then raise exception 'Select a roping classification first'; end if;
  insert into public.roping_qualification_checks(event_roping_id,producer_id,season_id,class_key,source_revision,rule_updated_at,
    top_places,minimum_ropings,cutoff_on,checked_by,standings,rule_set_id,requirement_match,earned_position_policy,bonus_entries_enabled)
  values(r.id,r.producer_id,q.season_id,class_key,revision,q.updated_at,q.top_places,q.minimum_ropings,q.cutoff_on,auth.uid(),target_standings,q.id,q.requirement_match,q.earned_position_policy,q.bonus_entries_enabled)
  on conflict(event_roping_id) do update set season_id=excluded.season_id,class_key=excluded.class_key,source_revision=excluded.source_revision,
    rule_updated_at=excluded.rule_updated_at,top_places=excluded.top_places,minimum_ropings=excluded.minimum_ropings,cutoff_on=excluded.cutoff_on,
    checked_at=now(),checked_by=auth.uid(),standings=excluded.standings,rule_set_id=excluded.rule_set_id,
    requirement_match=excluded.requirement_match,earned_position_policy=excluded.earned_position_policy,bonus_entries_enabled=excluded.bonus_entries_enabled;
end; $$;
revoke all on function public.save_rule_set_qualification_check(uuid,uuid,bigint,timestamptz,jsonb) from public,anon;
grant execute on function public.save_rule_set_qualification_check(uuid,uuid,bigint,timestamptz,jsonb) to authenticated;

create function public.save_qualification_assignment(target_event_id uuid,target_roping_id uuid,target_mode text,target_rule_set_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare e public.events%rowtype; r public.event_ropings%rowtype;
begin
  select * into e from public.events where id=target_event_id for update;
  if e.id is null or not public.can_manage_organization(e.producer_id) then raise exception 'Producer management access is required'; end if;
  if target_mode not in ('inherit','none','custom') or target_mode is null then raise exception 'Choose qualification requirements'; end if;
  if target_rule_set_id is not null and not exists(select 1 from public.qualification_rule_sets where id=target_rule_set_id and producer_id=e.producer_id) then raise exception 'Choose a rule set belonging to this producer'; end if;
  if target_mode='custom' and target_rule_set_id is null then raise exception 'Choose a qualification rule set'; end if;
  if target_roping_id is null then
    perform 1 from public.event_ropings where event_id=e.id order by id for update;
    if e.status in ('in_progress','completed','cancelled') or exists(select 1 from public.event_ropings where event_id=e.id and event_day_status in ('in_progress','completed')) then raise exception 'Event qualification locks when competition starts'; end if;
    if exists(select 1 from public.roping_entries x join public.event_ropings r on r.id=x.event_roping_id where r.event_id=e.id and r.qualification_override='inherit' and x.competition_status='active') then raise exception 'Set qualification rules before accepting entries in affected ropings'; end if;
    update public.events set qualification_rule_set_id=case when target_mode='none' then null else target_rule_set_id end where id=e.id;
    delete from public.roping_qualification_checks c using public.event_ropings r where c.event_roping_id=r.id and r.event_id=e.id and r.qualification_override='inherit';
  else
    select * into r from public.event_ropings where id=target_roping_id and event_id=e.id and producer_id=e.producer_id for update;
    if r.id is null then raise exception 'Roping not found'; end if;
    if r.event_day_status in ('in_progress','completed') then raise exception 'Qualification locks when this roping starts'; end if;
    if exists(select 1 from public.roping_entries where event_roping_id=r.id and competition_status='active') then raise exception 'Set qualification rules before accepting entries'; end if;
    update public.event_ropings set qualification_override=target_mode,qualification_rule_set_id=case when target_mode='custom' then target_rule_set_id else null end where id=r.id;
    delete from public.roping_qualification_checks where event_roping_id=r.id;
  end if;
end; $$;
revoke all on function public.save_qualification_assignment(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.save_qualification_assignment(uuid,uuid,text,uuid) to authenticated;

create function public.validate_qualification_assignment() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.qualification_rule_set_id is not null and not exists(select 1 from public.qualification_rule_sets q where q.id=new.qualification_rule_set_id and q.producer_id=new.producer_id) then raise exception 'Qualification rules must belong to the same producer'; end if;
  if tg_table_name='event_ropings' then
    if new.qualification_override='custom' and new.qualification_rule_set_id is null then raise exception 'Select a qualification rule set'; end if;
    if new.qualification_override<>'custom' and new.qualification_rule_set_id is not null then raise exception 'Only a custom override may select its own rule set'; end if;
    if tg_op='UPDATE' and (new.qualification_override,new.qualification_rule_set_id) is distinct from (old.qualification_override,old.qualification_rule_set_id) then
      if old.event_day_status in ('in_progress','completed') or exists(select 1 from public.roping_entries where event_roping_id=old.id and competition_status='active') then raise exception 'Qualification cannot change after accepting entries or starting competition'; end if;
    end if;
  elsif tg_op='UPDATE' and new.qualification_rule_set_id is distinct from old.qualification_rule_set_id then
    if old.status in ('in_progress','completed','cancelled') or exists(select 1 from public.event_ropings r where r.event_id=old.id and (r.event_day_status in ('in_progress','completed') or r.qualification_override='inherit' and exists(select 1 from public.roping_entries x where x.event_roping_id=r.id and x.competition_status='active'))) then raise exception 'Event qualification cannot change after entries or competition start'; end if;
  end if;
  return new;
end; $$;
revoke all on function public.validate_qualification_assignment() from public,anon,authenticated;
create trigger validate_event_qualification_assignment before insert or update on public.events for each row execute function public.validate_qualification_assignment();
create trigger validate_roping_qualification_assignment before insert or update on public.event_ropings for each row execute function public.validate_qualification_assignment();

create function public.public_qualification_rule_set_notices(target_producer_slug text,target_event_id uuid default null)
returns table(event_roping_id uuid,season_name text,top_places integer,minimum_ropings integer,cutoff_on date,requirements_available boolean,requirement_match text)
language sql stable security definer set search_path='' as $$
  select r.id,s.name,coalesce(q.top_places,old_rule.top_places),
    coalesce(q.minimum_ropings,old_rule.minimum_ropings),coalesce(q.cutoff_on,old_rule.cutoff_on),
    q.id is not null or old_rule.class_key is not null,
    coalesce(q.requirement_match,'all')
  from public.event_ropings r
  join public.events e on e.id=r.event_id and e.producer_id=r.producer_id
  join public.producers p on p.id=r.producer_id
  left join public.qualification_rule_sets q on q.id=public.effective_qualification_rule_set(r.id) and q.producer_id=r.producer_id
  left join public.roping_qualification_checks c on c.event_roping_id=r.id and c.producer_id=r.producer_id
  join public.producer_seasons s on s.id=coalesce(q.season_id,c.season_id) and s.producer_id=r.producer_id
  left join public.standings_qualification_rules old_rule on q.id is null and old_rule.producer_id=r.producer_id and old_rule.season_id=c.season_id and old_rule.class_key=c.class_key
  where p.slug=target_producer_slug and e.publication_state='published' and e.status<>'cancelled'
    and r.qualification_override<>'none' and (q.id is not null or c.event_roping_id is not null)
    and (target_event_id is null or e.id=target_event_id);
$$;
revoke all on function public.public_qualification_rule_set_notices(text,uuid) from public;
grant execute on function public.public_qualification_rule_set_notices(text,uuid) to anon,authenticated;
