alter table public.standings_qualification_rules add column earned_position_policy text not null default 'none' check(earned_position_policy in ('none','rank','rank_and_attendance'));
create table public.finals_qualification_decisions (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  rule_id uuid not null references public.finals_qualification_rules(id) on delete cascade,
  place integer not null check(place>0),
  kind text not null check(kind in ('tie','revoke')),
  entry_ids uuid[] not null check(cardinality(entry_ids)>0),
  context jsonb not null check(jsonb_typeof(context)='array'),
  reason text not null check(length(trim(reason)) between 5 and 2000),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
alter table public.finals_qualification_decisions enable row level security;
grant select,insert on public.finals_qualification_decisions to authenticated;
create policy "Staff read finals decisions" on public.finals_qualification_decisions for select to authenticated using(public.has_organization_access(producer_id));
create policy "Managers record finals decisions" on public.finals_qualification_decisions for insert to authenticated with check(public.can_manage_organization(producer_id) and created_by=auth.uid());
create function public.validate_finals_staff_decision() returns trigger language plpgsql security definer set search_path='' as $$
declare rule public.finals_qualification_rules%rowtype;
begin
  select * into rule from public.finals_qualification_rules where id=new.rule_id and producer_id=new.producer_id;
  if rule.id is null then raise exception 'Choose a qualifier belonging to this producer'; end if;
  if cardinality(new.entry_ids)<>(select count(distinct id) from unnest(new.entry_ids) id)
    or exists(select 1 from unnest(new.entry_ids) id where not exists(select 1 from public.roping_entries e where e.id=id and e.event_roping_id=rule.event_roping_id and e.producer_id=new.producer_id and e.membership_id is not null)) then
    raise exception 'Choose distinct member entries in this qualifier';
  end if;
  return new;
end;
$$;

drop function public.public_standings_qualification_rules(text,uuid);
create function public.public_standings_qualification_rules(target_producer_slug text,target_season_id uuid)
returns table(class_key text,top_places integer,minimum_ropings integer,cutoff_on date,earned_position_policy text)
language sql stable security definer set search_path='' as $$
  select r.class_key,r.top_places,r.minimum_ropings,r.cutoff_on,r.earned_position_policy
  from public.standings_qualification_rules r join public.producers p on p.id=r.producer_id
  where p.slug=target_producer_slug and r.season_id=target_season_id;
$$;
revoke all on function public.public_standings_qualification_rules(text,uuid) from public;
grant execute on function public.public_standings_qualification_rules(text,uuid) to anon,authenticated;
create trigger validate_finals_decision before insert on public.finals_qualification_decisions for each row execute function public.validate_finals_staff_decision();
create trigger audit_finals_decisions after insert on public.finals_qualification_decisions for each row execute function public.write_audit_log();
create trigger standings_changed_finals_decisions after insert on public.finals_qualification_decisions for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_finals_manual after insert or update on public.manual_finals_positions for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_finals_rules after insert or update or delete on public.finals_qualification_rules for each row execute function public.invalidate_qualification_standings();
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.finals_qualification_source(text,uuid)'::regprocedure);
  definition:=replace(definition,'''profiles'',coalesce(', E'''decisions'',coalesce((select jsonb_agg(jsonb_build_object(''ruleId'',d.rule_id,''place'',d.place,''kind'',d.kind,''entryIds'',d.entry_ids,''context'',d.context) order by d.created_at desc,d.id desc) from public.finals_qualification_decisions d join rules q on q.id=d.rule_id and q.producer_id=d.producer_id),''[]''::jsonb),\n ''profiles'',coalesce(');
  definition:=replace(definition,'where q.enabled and (','where q.enabled and r.scheduled_date between s.starts_on and s.ends_on and (');
  execute definition;
end;
$$;

-- Include this setting in the existing requirements snapshot freshness check.
create function public.touch_finals_entry_policy() returns trigger language plpgsql set search_path='' as $$
begin
  if old.earned_position_policy is distinct from new.earned_position_policy then new.updated_at:=now(); end if;
  return new;
end;
$$;
create trigger touch_finals_entry_policy before update on public.standings_qualification_rules for each row execute function public.touch_finals_entry_policy();
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.standings_qualification_failure(uuid,uuid)'::regprocedure);
  definition:=replace(definition,'if row is null then', E'if coalesce((row->>''finalsPositions'')::integer,0)>0 then\n    if exists(select 1 from public.standings_qualification_rules r where r.producer_id=check_record.producer_id and r.season_id=check_record.season_id and r.class_key=check_record.class_key and (r.earned_position_policy=''rank_and_attendance'' or r.earned_position_policy=''rank'' and coalesce((row->>''ropingsEntered'')::integer,0)>=check_record.minimum_ropings)) then return null; end if;\n  end if;\n  if row is null then');
  execute definition;
end;
$$;
