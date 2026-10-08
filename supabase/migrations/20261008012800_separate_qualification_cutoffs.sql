alter table public.qualification_rule_sets add column attendance_cutoff_on date;
alter table public.standings_qualification_rules add column attendance_cutoff_on date;
alter table public.roping_qualification_checks add column attendance_cutoff_on date;

-- Existing explicit deadlines previously governed both requirements.
update public.qualification_rule_sets set attendance_cutoff_on=cutoff_on where cutoff_on is not null;
update public.standings_qualification_rules set attendance_cutoff_on=cutoff_on where cutoff_on is not null;
update public.roping_qualification_checks set attendance_cutoff_on=cutoff_on where cutoff_on is not null;

create or replace function public.validate_qualification_rule_set() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.producer_seasons s where s.id=new.season_id and s.producer_id=new.producer_id
    and (new.cutoff_on is null or new.cutoff_on between s.starts_on and s.ends_on)
    and (new.attendance_cutoff_on is null or new.attendance_cutoff_on between s.starts_on and s.ends_on)) then
    raise exception 'Choose a producer season and cutoff dates within that season';
  end if;
  if tg_op='UPDATE' and new.producer_id<>old.producer_id then raise exception 'A rule set cannot change producer'; end if;
  new.updated_at:=clock_timestamp();
  return new;
end; $$;

create or replace function public.validate_standings_qualification_rule() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from public.producer_seasons s where s.id=new.season_id and s.producer_id=new.producer_id
    and (new.cutoff_on is null or new.cutoff_on between s.starts_on and s.ends_on)
    and (new.attendance_cutoff_on is null or new.attendance_cutoff_on between s.starts_on and s.ends_on)) then
    raise exception 'Choose a producer season and cutoff dates within that season';
  end if;
  if not exists(select 1 from public.classifications c where c.producer_id=new.producer_id and c.id::text=new.class_key)
    and not exists(select 1 from public.divisions d where d.producer_id=new.producer_id
      and new.class_key in (d.id::text||':handicap',d.id::text||':four_d')) then
    raise exception 'Choose a class belonging to this producer';
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end; $$;

create function public.snapshot_qualification_attendance_cutoff() returns trigger
language plpgsql security definer set search_path='' as $$
declare source_updated_at timestamptz;
begin
  if new.rule_set_id is not null then
    select q.attendance_cutoff_on,q.updated_at into new.attendance_cutoff_on,source_updated_at
      from public.qualification_rule_sets q where q.id=new.rule_set_id and q.producer_id=new.producer_id for share;
  else
    select q.attendance_cutoff_on,q.updated_at into new.attendance_cutoff_on,source_updated_at
      from public.standings_qualification_rules q where q.season_id=new.season_id and q.class_key=new.class_key
        and q.producer_id=new.producer_id for share;
  end if;
  if source_updated_at is distinct from new.rule_updated_at then raise exception 'Qualification requirements changed. Reload and try again'; end if;
  return new;
end; $$;
revoke all on function public.snapshot_qualification_attendance_cutoff() from public,anon,authenticated;
create trigger snapshot_qualification_attendance_cutoff before insert or update on public.roping_qualification_checks
  for each row execute function public.snapshot_qualification_attendance_cutoff();

drop function public.public_standings_qualification_rules(text,uuid);
create function public.public_standings_qualification_rules(target_producer_slug text,target_season_id uuid)
returns table(class_key text,top_places integer,minimum_ropings integer,cutoff_on date,earned_position_policy text,attendance_cutoff_on date)
language sql stable security definer set search_path='' as $$
  select r.class_key,r.top_places,r.minimum_ropings,r.cutoff_on,r.earned_position_policy,r.attendance_cutoff_on
  from public.standings_qualification_rules r join public.producers p on p.id=r.producer_id
  where p.slug=target_producer_slug and r.season_id=target_season_id;
$$;
revoke all on function public.public_standings_qualification_rules(text,uuid) from public;
grant execute on function public.public_standings_qualification_rules(text,uuid) to anon,authenticated;

drop function public.public_qualification_rule_set_notices(text,uuid);
create function public.public_qualification_rule_set_notices(target_producer_slug text,target_event_id uuid default null)
returns table(event_roping_id uuid,season_name text,top_places integer,minimum_ropings integer,cutoff_on date,requirements_available boolean,requirement_match text,attendance_cutoff_on date)
language sql stable security definer set search_path='' as $$
  select r.id,s.name,coalesce(q.top_places,old_rule.top_places),
    coalesce(q.minimum_ropings,old_rule.minimum_ropings),coalesce(q.cutoff_on,old_rule.cutoff_on),
    q.id is not null or old_rule.class_key is not null,coalesce(q.requirement_match,'all'),
    coalesce(q.attendance_cutoff_on,old_rule.attendance_cutoff_on)
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
