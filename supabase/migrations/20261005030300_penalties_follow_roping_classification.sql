create or replace function public.applicable_run_penalties(target_run_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  r record;
  contestant_age integer;
  options jsonb;
begin
  select run.producer_id,run.applied_penalties,run.penalty_seconds,roping.division_id,
    roping.classification_id,roping.scheduled_date,roper.birth_date
  into r from public.competition_runs run
  join public.event_ropings roping on roping.id=run.event_roping_id
  join public.roping_entries entry on entry.id=run.entry_id
  join public.ropers roper on roper.id=entry.roper_id where run.id=target_run_id;
  if r.producer_id is null or not public.can_manage_organization(r.producer_id) then
    raise exception 'You do not have permission to access run penalties';
  end if;
  contestant_age := extract(year from age(r.scheduled_date,r.birth_date));
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id::text,'name',p.name,'seconds',p.seconds) order by p.name),'[]')
  into options from public.producer_penalty_rules p
  where p.producer_id=r.producer_id and p.division_id=r.division_id and p.is_active
    and (p.classification_mode='all' or (r.classification_id is not null and
      case p.classification_mode when 'only' then r.classification_id=any(p.classification_ids)
        else not r.classification_id=any(p.classification_ids) end))
    and (p.age_mode='all' or (contestant_age is not null and
      case p.age_mode when 'only' then
        (p.minimum_age is null or contestant_age>=p.minimum_age) and (p.maximum_age is null or contestant_age<=p.maximum_age)
      else not ((p.minimum_age is null or contestant_age>=p.minimum_age) and (p.maximum_age is null or contestant_age<=p.maximum_age)) end));
  -- Preserve already-applied penalties when correcting a recorded run.
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
alter table public.producer_penalty_rules drop column classification_basis;
