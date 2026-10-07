create table public.finals_qualification_rules (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  season_id uuid not null references public.producer_seasons(id),
  event_roping_id uuid not null references public.event_ropings(id) on delete cascade,
  stage text not null check(stage in ('go_round','aggregate','short_round')),
  round_number integer not null default 0,
  places jsonb not null,
  repeat_policy text not null default 'accumulate' check(repeat_policy in ('accumulate','skip','pass_down')),
  tie_policy text not null default 'all' check(tie_policy in ('all','staff_decision')),
  maximum_positions integer check(maximum_positions>0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_roping_id,stage,round_number),
  check((stage='go_round' and round_number>0) or (stage<>'go_round' and round_number=0))
);
create table public.manual_finals_positions (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  season_id uuid not null references public.producer_seasons(id),
  membership_id uuid not null references public.memberships(id),
  class_key text not null,
  awarded_on date not null,
  positions integer not null check(positions>0),
  reason text not null check(length(trim(reason)) between 5 and 2000),
  revoked boolean not null default false,
  revoke_reason text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  check(not revoked or length(trim(revoke_reason)) between 5 and 2000)
);
alter table public.finals_qualification_rules enable row level security;
alter table public.manual_finals_positions enable row level security;
revoke all on public.finals_qualification_rules,public.manual_finals_positions from anon,authenticated;
grant select,insert,update,delete on public.finals_qualification_rules to authenticated;
grant select,insert,update on public.manual_finals_positions to authenticated;
create policy "Staff read finals rules" on public.finals_qualification_rules for select to authenticated using(public.has_organization_access(producer_id));
create policy "Managers configure finals rules" on public.finals_qualification_rules for all to authenticated using(public.can_manage_event_roping(event_roping_id)) with check(public.can_manage_event_roping(event_roping_id));
create policy "Staff read manual finals positions" on public.manual_finals_positions for select to authenticated using(public.has_organization_access(producer_id));
create policy "Managers award manual finals positions" on public.manual_finals_positions for insert to authenticated with check(public.can_manage_organization(producer_id) and created_by=auth.uid());
create policy "Managers revoke manual finals positions" on public.manual_finals_positions for update to authenticated using(public.can_manage_organization(producer_id)) with check(public.can_manage_organization(producer_id));

create function public.validate_finals_qualification_record() returns trigger language plpgsql security definer set search_path='' as $$
declare season public.producer_seasons%rowtype; roping public.event_ropings%rowtype; place jsonb;
begin
  select * into season from public.producer_seasons where id=new.season_id and producer_id=new.producer_id;
  if season.id is null then raise exception 'Choose a season belonging to this producer'; end if;
  if tg_table_name='finals_qualification_rules' then
    select * into roping from public.event_ropings where id=new.event_roping_id and producer_id=new.producer_id;
    if roping.id is null or roping.scheduled_date not between season.starts_on and season.ends_on then raise exception 'The qualifier roping must fall within the selected season'; end if;
    if new.stage='go_round' and new.round_number>roping.main_round_count then raise exception 'Choose an existing main round'; end if;
    if new.stage='short_round' and not roping.short_round_enabled then raise exception 'This roping does not have a short round'; end if;
    if jsonb_typeof(new.places)<>'array' or jsonb_array_length(new.places) not between 1 and 100 then raise exception 'Choose between one and 100 qualifying places'; end if;
    for place in select value from jsonb_array_elements(new.places) loop
      if jsonb_typeof(place->'place')<>'number' or jsonb_typeof(place->'positions')<>'number' or (place->>'place')::numeric not between 1 and 10000 or (place->>'positions')::numeric not between 1 and 1000
        or trunc((place->>'place')::numeric)<>(place->>'place')::numeric or trunc((place->>'positions')::numeric)<>(place->>'positions')::numeric then raise exception 'Places and positions must be positive whole numbers'; end if;
    end loop;
    if exists(select value->>'place' from jsonb_array_elements(new.places) group by value->>'place' having count(*)>1) then raise exception 'A qualifying place cannot be repeated'; end if;
    new.updated_at:=now();
  else
    if not exists(select 1 from public.memberships where id=new.membership_id and producer_id=new.producer_id) then raise exception 'Choose a member belonging to this producer'; end if;
    if new.awarded_on not between season.starts_on and season.ends_on then raise exception 'The award date must fall within the selected season'; end if;
    if not exists(select 1 from public.classifications where id::text=new.class_key and producer_id=new.producer_id)
      and not exists(select 1 from public.divisions where producer_id=new.producer_id and new.class_key in (id::text||':handicap',id::text||':four_d')) then raise exception 'Choose a finals class belonging to this producer'; end if;
    if tg_op='UPDATE' and (new.id,new.producer_id,new.season_id,new.membership_id,new.class_key,new.awarded_on,new.positions,new.reason,new.created_by) is distinct from (old.id,old.producer_id,old.season_id,old.membership_id,old.class_key,old.awarded_on,old.positions,old.reason,old.created_by) then raise exception 'Revoke an incorrect award and add a corrected award; do not overwrite its history'; end if;
  end if;
  return new;
end;
$$;
create trigger validate_finals_rule before insert or update on public.finals_qualification_rules for each row execute function public.validate_finals_qualification_record();
create trigger validate_manual_finals_position before insert or update on public.manual_finals_positions for each row execute function public.validate_finals_qualification_record();
create trigger audit_finals_rules after insert or update or delete on public.finals_qualification_rules for each row execute function public.write_audit_log();
create trigger audit_manual_finals_positions after insert or update on public.manual_finals_positions for each row execute function public.write_audit_log();

-- A narrow public projection: official placings and qualification counts, never private notes or contact details.
create function public.finals_qualification_source(target_producer_slug text,target_season_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
with producer as (select * from public.producers where slug=target_producer_slug),
season as (select s.* from public.producer_seasons s join producer p on p.id=s.producer_id where s.id=target_season_id),
rules as materialized (
  select q.*,r.main_round_count,r.short_round_enabled,r.scheduled_date,
    case when r.competition_format in ('handicap','four_d') then r.division_id::text||':'||r.competition_format else r.classification_id::text end as class_key
  from public.finals_qualification_rules q join public.event_ropings r on r.id=q.event_roping_id join public.events e on e.id=r.event_id
  join season s on s.id=q.season_id and s.producer_id=q.producer_id
  where q.enabled and (public.has_organization_access(q.producer_id) or (e.is_public and e.publication_state='published'))
), performances as materialized (
  select q.id,q.producer_id,q.season_id,q.class_key,q.event_roping_id,q.stage,q.round_number,q.scheduled_date,
    e.id as entry_id,e.membership_id,e.roper_id,
    case when q.stage='aggregate' then sum(round(greatest(run.raw_time_seconds+run.penalty_seconds-e.handicap_time_credit_seconds,0),2))
      else min(round(greatest(run.raw_time_seconds+run.penalty_seconds-e.handicap_time_credit_seconds,0),2)) end as seconds
  from rules q join public.event_ropings r on r.id=q.event_roping_id join public.roping_entries e on e.event_roping_id=r.id
  join public.competition_runs run on run.entry_id=e.id and not run.is_excluded and run.status='complete' and run.raw_time_seconds is not null
    and (case q.stage when 'go_round' then run.round_number=q.round_number when 'short_round' then run.round_number=q.main_round_count+1 else run.round_number<=q.main_round_count+case when q.short_round_enabled then 1 else 0 end end)
  where r.result_status='official' and e.competition_status='active'
  group by q.id,q.producer_id,q.season_id,q.class_key,q.event_roping_id,q.stage,q.round_number,q.scheduled_date,e.id,e.membership_id,e.roper_id,q.main_round_count,q.short_round_enabled
  having q.stage<>'aggregate' or count(distinct run.round_number)=q.main_round_count+case when q.short_round_enabled then 1 else 0 end
), finishes as (
  select *,rank() over(partition by id order by seconds)::integer as place from performances
)
select jsonb_build_object(
 'rules',coalesce((select jsonb_agg(jsonb_build_object('id',id,'producerId',producer_id,'seasonId',season_id,'classId',class_key,'ropingId',event_roping_id,'stage',stage,'round',case when stage='go_round' then round_number end,'places',places,'repeatPolicy',repeat_policy,'tiePolicy',tie_policy,'maximumPositions',maximum_positions)) from rules where class_key is not null),'[]'::jsonb),
 'finishes',coalesce((select jsonb_agg(jsonb_build_object('producerId',producer_id,'seasonId',season_id,'classId',class_key,'ropingId',event_roping_id,'stage',stage,'round',case when stage='go_round' then round_number end,'date',scheduled_date,'official',true,'entryId',entry_id,'memberId',membership_id,'place',place)) from finishes where class_key is not null),'[]'::jsonb),
 'manual',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'producerId',m.producer_id,'seasonId',m.season_id,'classId',m.class_key,'memberId',m.membership_id,'date',m.awarded_on,'positions',m.positions,'reason','Staff award','revoked',m.revoked)) from public.manual_finals_positions m join season s on s.id=m.season_id and s.producer_id=m.producer_id),'[]'::jsonb),
 'profiles',coalesce((select jsonb_agg(jsonb_build_object('memberId',m.id,'roperId',m.roper_id,'name',concat_ws(' ',r.first_name,r.last_name))) from public.memberships m join public.ropers r on r.id=m.roper_id join producer p on p.id=m.producer_id
   where m.id in (select membership_id from finishes union select membership_id from public.manual_finals_positions where season_id=target_season_id and producer_id=p.id)),'[]'::jsonb)
);
$$;
revoke all on function public.finals_qualification_source(text,uuid) from public;
grant execute on function public.finals_qualification_source(text,uuid) to anon,authenticated;
