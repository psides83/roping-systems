create table public.producer_penalty_rules (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete cascade,
  division_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 80),
  seconds numeric(6,2) not null check (seconds > 0 and seconds <= 999),
  classification_mode text not null default 'all' check (classification_mode in ('all','only','except')),
  classification_ids uuid[] not null default '{}',
  age_mode text not null default 'all' check (age_mode in ('all','only','except')),
  minimum_age integer check (minimum_age between 0 and 120),
  maximum_age integer check (maximum_age between 0 and 120),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (division_id,producer_id) references public.divisions(id,producer_id),
  check (maximum_age is null or minimum_age is null or maximum_age >= minimum_age),
  check (classification_mode = 'all' or cardinality(classification_ids) > 0),
  check (age_mode = 'all' or minimum_age is not null or maximum_age is not null)
);
alter table public.producer_penalty_rules enable row level security;
grant select,insert,update,delete on public.producer_penalty_rules to authenticated;
create policy "Staff read penalty rules" on public.producer_penalty_rules for select to authenticated
using (public.has_organization_access(producer_id));
create policy "Managers manage penalty rules" on public.producer_penalty_rules for all to authenticated
using (public.can_manage_organization(producer_id)) with check (public.can_manage_organization(producer_id));
create function public.validate_producer_penalty_rule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.producer_id <> old.producer_id then raise exception 'Cannot move a penalty to another producer'; end if;
  if exists(select 1 from unnest(new.classification_ids) id where not exists
    (select 1 from public.classifications c where c.id=id and c.producer_id=new.producer_id and c.division_id=new.division_id)) then
    raise exception 'Choose classifications from this penalty division';
  end if;
  return new;
end;
$$;
revoke all on function public.validate_producer_penalty_rule() from public;
create trigger validate_producer_penalty_rule before insert or update on public.producer_penalty_rules
for each row execute function public.validate_producer_penalty_rule();
create trigger audit_producer_penalty_rules after insert or update or delete on public.producer_penalty_rules
for each row execute function public.write_audit_log();
alter table public.competition_runs add column applied_penalties jsonb not null default '[]'
check (jsonb_typeof(applied_penalties) = 'array');

create function public.applicable_run_penalties(target_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record;
  member_class uuid;
  contestant_age integer;
  options jsonb;
begin
  select run.producer_id,run.applied_penalties,run.penalty_seconds,roping.division_id,
    roping.scheduled_date,entry.membership_id,entry.handicap_classification_id,roper.birth_date
  into r from public.competition_runs run
  join public.event_ropings roping on roping.id=run.event_roping_id
  join public.roping_entries entry on entry.id=run.entry_id
  join public.ropers roper on roper.id=entry.roper_id where run.id=target_run_id;
  if r.producer_id is null or not public.can_manage_organization(r.producer_id) then
    raise exception 'You do not have permission to access run penalties';
  end if;
  select h.classification_id into member_class from public.membership_classification_history h
  where h.membership_id=r.membership_id and h.division_id=r.division_id
    and h.effective_on <= r.scheduled_date and (h.ended_on is null or h.ended_on >= r.scheduled_date)
  order by h.effective_on desc,h.created_at desc limit 1;
  member_class := coalesce(r.handicap_classification_id,member_class);
  contestant_age := extract(year from age(r.scheduled_date,r.birth_date));
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id::text,'name',p.name,'seconds',p.seconds) order by p.name),'[]')
  into options from public.producer_penalty_rules p
  where p.producer_id=r.producer_id and p.division_id=r.division_id and p.is_active
    and (p.classification_mode='all' or (member_class is not null and
      case p.classification_mode when 'only' then member_class=any(p.classification_ids)
        else not member_class=any(p.classification_ids) end))
    and (p.age_mode='all' or (contestant_age is not null and
      case p.age_mode when 'only' then
        (p.minimum_age is null or contestant_age>=p.minimum_age) and (p.maximum_age is null or contestant_age<=p.maximum_age)
      else not ((p.minimum_age is null or contestant_age>=p.minimum_age) and (p.maximum_age is null or contestant_age<=p.maximum_age)) end));
  -- Keep historical choices available during corrections, even if the rule is later edited or retired.
  select coalesce(jsonb_agg(current),'[]') into options from jsonb_array_elements(options) current
  where not exists(select 1 from jsonb_array_elements(r.applied_penalties) saved where saved->>'id'=current->>'id');
  select options || coalesce(jsonb_agg(saved || jsonb_build_object('retained',true)),'[]') into options
  from jsonb_array_elements(r.applied_penalties) saved;
  if r.applied_penalties='[]' and r.penalty_seconds>0 then
    options := options || jsonb_build_array(jsonb_build_object('id','recorded','name','Previously recorded penalty','seconds',r.penalty_seconds,'retained',true));
  end if;
  return options;
end;
$$;
revoke all on function public.applicable_run_penalties(uuid) from public;
grant execute on function public.applicable_run_penalties(uuid) to authenticated;

create function public.event_run_penalty_options(target_event_roping_id uuid)
returns table(run_id uuid,options jsonb) language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.event_ropings r where r.id=target_event_roping_id
    and public.can_manage_organization(r.producer_id)) then raise exception 'You do not have permission to view penalties'; end if;
  return query select r.id,public.applicable_run_penalties(r.id)
  from public.competition_runs r where r.event_roping_id=target_event_roping_id;
end;
$$;
revoke all on function public.event_run_penalty_options(uuid) from public;
grant execute on function public.event_run_penalty_options(uuid) to authenticated;

create function public.save_run_with_penalties(target_run_id uuid,entered_timer_readings numeric[],
  selected_penalty_ids text[],entered_status public.run_status,entered_reason text default null)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  run public.competition_runs%rowtype;
  options jsonb;
  selections jsonb;
  total numeric;
  result numeric;
begin
  select * into run from public.competition_runs where id=target_run_id for update;
  options := public.applicable_run_penalties(target_run_id);
  if exists(select 1 from unnest(selected_penalty_ids) id where not exists
    (select 1 from jsonb_array_elements(options) option where option->>'id'=id)) then
    raise exception 'A selected penalty no longer applies to this contestant. Reload the desk.';
  end if;
  if cardinality(selected_penalty_ids)<>(select count(distinct id) from unnest(selected_penalty_ids) id) then
    raise exception 'A penalty cannot be applied more than once';
  end if;
  select coalesce(jsonb_agg(option),'[]'),coalesce(sum((option->>'seconds')::numeric),0)
  into selections,total from jsonb_array_elements(options) option where option->>'id'=any(selected_penalty_ids);
  if entered_status<>'complete' then selections:='[]'; total:=0; end if;
  if total>999 then raise exception 'Combined penalty exceeds 999 seconds'; end if;
  if entered_reason is null then
    result:=public.record_run_result_multi(target_run_id,entered_timer_readings,total,entered_status);
  else
    result:=public.correct_run_result_multi(target_run_id,entered_timer_readings,total,entered_status,entered_reason);
  end if;
  update public.competition_runs set applied_penalties=selections where id=target_run_id;
  return result;
end;
$$;
revoke all on function public.save_run_with_penalties(uuid,numeric[],text[],public.run_status,text) from public;
grant execute on function public.save_run_with_penalties(uuid,numeric[],text[],public.run_status,text) to authenticated;
