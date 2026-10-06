alter table public.producers add column standings_revision bigint not null default 0;
create table public.roping_qualification_checks (
  event_roping_id uuid primary key references public.event_ropings(id) on delete cascade,
  producer_id uuid not null references public.producers(id) on delete cascade,
  season_id uuid not null references public.producer_seasons(id),
  class_key text not null,
  source_revision bigint not null,
  rule_updated_at timestamptz not null,
  top_places integer,
  minimum_ropings integer not null,
  cutoff_on date,
  checked_at timestamptz not null default now(),
  checked_by uuid references auth.users(id),
  standings jsonb not null check(jsonb_typeof(standings)='array')
);
alter table public.roping_qualification_checks enable row level security;
grant select on public.roping_qualification_checks to authenticated;
create policy "Staff read qualification checks" on public.roping_qualification_checks for select to authenticated
using(public.has_organization_access(producer_id));
create trigger audit_roping_qualification_checks after insert or update or delete on public.roping_qualification_checks
for each row execute function public.write_audit_log();

create function public.save_roping_qualification_check(target_roping_id uuid,target_season_id uuid,
  target_class_key text,expected_revision bigint,target_standings jsonb,target_rule_updated_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare
  roping public.event_ropings%rowtype;
  rule public.standings_qualification_rules%rowtype;
  revision bigint;
begin
  select * into roping from public.event_ropings where id=target_roping_id for update;
  if roping.id is null or not public.can_manage_organization(roping.producer_id) then
    raise exception 'Manager access is required';
  end if;
  if target_season_id is null then
    if roping.event_day_status in ('in_progress','completed') then raise exception 'Qualification cannot be removed after this roping starts'; end if;
    delete from public.roping_qualification_checks where event_roping_id=roping.id;
    return;
  end if;
  select * into rule from public.standings_qualification_rules
  where producer_id=roping.producer_id and season_id=target_season_id and class_key=target_class_key;
  if rule.season_id is null or rule.updated_at is distinct from target_rule_updated_at then
    raise exception 'Qualification requirements changed. Reload and try again';
  end if;
  if target_class_key is distinct from (case when roping.competition_format in ('handicap','four_d')
    then roping.division_id::text||':'||roping.competition_format else roping.classification_id::text end) then
    raise exception 'Qualification requirements must match this roping class';
  end if;
  if roping.event_day_status in ('in_progress','completed') and not exists(select 1 from public.roping_qualification_checks q
    where q.event_roping_id=roping.id and q.season_id=target_season_id and q.class_key=target_class_key) then
    raise exception 'Qualification cannot be changed after this roping starts';
  end if;
  if not exists(select 1 from public.roping_qualification_checks where event_roping_id=roping.id)
    and exists(select 1 from public.roping_entries where event_roping_id=roping.id and competition_status='active') then
    raise exception 'Set qualification requirements before accepting entries for this roping';
  end if;
  select standings_revision into revision from public.producers where id=roping.producer_id for update;
  if revision<>expected_revision then raise exception 'Standings changed while checking qualification. Try again'; end if;
  if jsonb_typeof(target_standings)<>'array' or jsonb_array_length(target_standings)>100000 then
    raise exception 'Invalid qualification standings';
  end if;
  insert into public.roping_qualification_checks(event_roping_id,producer_id,season_id,class_key,
    source_revision,rule_updated_at,top_places,minimum_ropings,cutoff_on,checked_by,standings)
  values(roping.id,roping.producer_id,rule.season_id,rule.class_key,revision,rule.updated_at,
    rule.top_places,rule.minimum_ropings,rule.cutoff_on,auth.uid(),target_standings)
  on conflict(event_roping_id) do update set season_id=excluded.season_id,class_key=excluded.class_key,
    source_revision=excluded.source_revision,rule_updated_at=excluded.rule_updated_at,
    top_places=excluded.top_places,minimum_ropings=excluded.minimum_ropings,cutoff_on=excluded.cutoff_on,
    checked_at=now(),checked_by=auth.uid(),standings=excluded.standings;
end;
$$;
revoke all on function public.save_roping_qualification_check(uuid,uuid,text,bigint,jsonb,timestamptz) from public;
grant execute on function public.save_roping_qualification_check(uuid,uuid,text,bigint,jsonb,timestamptz) to authenticated;

create function public.standings_qualification_failure(target_roping_id uuid,target_roper_id uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare
  check_record public.roping_qualification_checks%rowtype;
  row jsonb;
begin
  select * into check_record from public.roping_qualification_checks where event_roping_id=target_roping_id;
  if check_record.event_roping_id is null then return null; end if;
  if not exists(select 1 from public.producers p where p.id=check_record.producer_id and p.standings_revision=check_record.source_revision)
    or not exists(select 1 from public.standings_qualification_rules r where r.season_id=check_record.season_id
      and r.class_key=check_record.class_key and r.updated_at=check_record.rule_updated_at) then
    return 'Qualification standings changed. Refresh this roping qualification check before accepting entries';
  end if;
  select item into row from jsonb_array_elements(check_record.standings) item where item->>'roperId'=target_roper_id::text;
  if row is null then return 'Contestant has no qualifying standings for this class and season'; end if;
  if check_record.top_places is not null and (row->>'rank')::integer>check_record.top_places then
    return format('This roping requires a top %s standings position (ties included)',check_record.top_places);
  end if;
  if (row->>'ropingsEntered')::integer<check_record.minimum_ropings then
    return format('This roping requires %s ropings entered in this class; contestant has %s',check_record.minimum_ropings,row->>'ropingsEntered');
  end if;
  return null;
end;
$$;
revoke all on function public.standings_qualification_failure(uuid,uuid) from public;
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.enforce_entry_classification_eligibility()'::regprocedure);
  if position('if eligibility_failure is not null then' in definition)=0 then raise exception 'Unexpected eligibility function'; end if;
  definition := replace(definition,'if eligibility_failure is not null then',
    'if eligibility_failure is null then eligibility_failure := public.standings_qualification_failure(new.event_roping_id,new.roper_id); end if;
  if eligibility_failure is not null then');
  execute definition;
end;
$$;

create function public.invalidate_qualification_standings() returns trigger
language plpgsql security definer set search_path='' as $$
declare p uuid; row jsonb;
begin
  row := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  p := case when tg_op='DELETE' then old.producer_id else new.producer_id end;
  if tg_table_name in ('competition_runs','roping_entries','entry_charges','event_fees','roping_funding') then
    if not exists(select 1 from public.event_ropings r where r.id=coalesce(
      (row->>'event_roping_id')::uuid,
      (select e.event_roping_id from public.roping_entries e where e.id=(row->>'entry_id')::uuid))
      and r.result_status='official') then return null; end if;
  elsif tg_table_name='event_ropings' then
    if coalesce(row->>'result_status','')<>'official'
      and (tg_op<>'UPDATE' or old.result_status<>'official') then return null; end if;
  end if;
  update public.producers set standings_revision=standings_revision+1 where id=p;
  return null;
end;
$$;
revoke all on function public.invalidate_qualification_standings() from public;
-- Changes that affect winnings, attendance, season attribution, or carryover invalidate cached checks.
create trigger standings_changed_runs after insert or update or delete on public.competition_runs
for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_class_history after insert or update or delete on public.membership_classification_history
for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_classes after update or delete on public.classifications
for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_plans after insert or update or delete on public.event_roping_payout_plans
for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_brackets after insert or update or delete on public.event_roping_payout_brackets
for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_places after insert or update or delete on public.event_roping_payout_places
for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_ropings after update or delete on public.event_ropings
for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_seasons after update or delete on public.producer_seasons
for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_entries after insert or update or delete on public.roping_entries
for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_charges after insert or update or delete on public.entry_charges
for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_fees after insert or update or delete on public.event_fees
for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_funding after insert or update or delete on public.roping_funding
for each row execute function public.invalidate_qualification_standings();
create trigger standings_changed_events after update or delete on public.events
for each row execute function public.invalidate_qualification_standings();

create function public.check_reinstated_entry_qualification() returns trigger
language plpgsql security definer set search_path='' as $$
declare failure text;
begin
  if old.competition_status='withdrawn' and new.competition_status='active' then
    failure := public.standings_qualification_failure(new.event_roping_id,new.roper_id);
    if failure is not null then raise exception '%',failure; end if;
  end if;
  return new;
end;
$$;
create trigger qualification_on_reinstatement before update of competition_status on public.roping_entries
for each row execute function public.check_reinstated_entry_qualification();
