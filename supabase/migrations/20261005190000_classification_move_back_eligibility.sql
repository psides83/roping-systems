create schema if not exists private;
revoke all on schema private from public,anon,authenticated;

alter table public.producers
  add column classification_move_back_enabled boolean not null default false,
  add column classification_move_back_min_ropings integer not null default 1
    check (classification_move_back_min_ropings between 1 and 100);
alter table public.membership_classification_history add column previous_assignment_id uuid,
  add column ended_at timestamptz,
  add constraint classification_previous_assignment_fk foreign key(previous_assignment_id,producer_id)
    references public.membership_classification_history(id,producer_id);

with ordered as (
  select id,lag(id) over(partition by membership_id,division_id order by effective_on,created_at,id) previous
  from public.membership_classification_history
)
update public.membership_classification_history h set previous_assignment_id=o.previous
from ordered o where o.id=h.id and o.previous is not null;
update public.membership_classification_history set ended_at=greatest(created_at,ended_on::timestamp at time zone 'UTC') where ended_on is not null;

alter table public.competition_runs add column first_competed_at timestamptz,
  add column competed_assignment_id uuid,
  add constraint competition_run_assignment_fk foreign key(competed_assignment_id,producer_id)
    references public.membership_classification_history(id,producer_id);

-- Use the earliest retained scoring record, not the timestamp of a later correction.
alter table public.competition_runs disable trigger guard_finalized_runs;
with evidence as (
  select a.entity_id,min(coalesce(nullif(a.after_data->>'recorded_at','')::timestamptz,a.created_at)) first_time
  from public.producer_audit_log a where a.entity_type in ('competition_runs','runs')
    and (a.after_data->>'status' in ('complete','no_time')
      or (a.after_data->>'status'='disqualified' and a.after_data->>'raw_time_seconds' is not null))
  group by a.entity_id
)
update public.competition_runs r set first_competed_at=coalesce(e.first_time,r.recorded_at)
from evidence e where e.entity_id=r.id;
update public.competition_runs set first_competed_at=recorded_at
where first_competed_at is null and (status in ('complete','no_time') or (status='disqualified' and raw_time_seconds is not null));
update public.competition_runs run set competed_assignment_id=(
  select h.id from public.roping_entries e join public.event_ropings er on er.id=e.event_roping_id
  join public.membership_classification_history h on h.membership_id=e.membership_id and h.division_id=er.division_id
  where e.id=run.entry_id and h.created_at<=run.first_competed_at and h.effective_on<=er.scheduled_date
    and (h.ended_on is null or h.ended_on>=er.scheduled_date)
  order by h.effective_on desc,h.created_at desc limit 1
) where first_competed_at is not null;
alter table public.competition_runs enable trigger guard_finalized_runs;

create table public.classification_move_back_exceptions (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  membership_id uuid not null,
  division_id uuid not null,
  assignment_id uuid not null unique,
  reason text not null check(length(trim(reason)) between 5 and 2000),
  required_ropings integer not null,
  completed_ropings integer not null,
  approved_by uuid not null references auth.users(id),
  staff_label text not null,
  created_at timestamptz not null default now(),
  foreign key(membership_id,producer_id) references public.memberships(id,producer_id),
  foreign key(division_id,producer_id) references public.divisions(id,producer_id),
  foreign key(assignment_id,producer_id) references public.membership_classification_history(id,producer_id)
);
alter table public.classification_move_back_exceptions enable row level security;
create policy "Staff read move-back exceptions" on public.classification_move_back_exceptions
  for select to authenticated using(public.has_organization_access(producer_id));
create trigger audit_move_back_exceptions after insert or update or delete on public.classification_move_back_exceptions
  for each row execute function public.write_audit_log();
create index competition_runs_competed_assignment_idx on public.competition_runs(competed_assignment_id)
  where competed_assignment_id is not null;

create function private.classification_move_back_state(target_assignment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare h public.membership_classification_history%rowtype; prior public.membership_classification_history%rowtype;
  root public.membership_classification_history%rowtype; settings record; exception record;
  segment uuid[]; competed integer; previous_class uuid;
begin
  select * into h from public.membership_classification_history where id=target_assignment_id;
  if not found then return null; end if;
  root:=h; segment:=array[h.id];
  -- A repeated assignment of the same class does not reset eligibility or bypass the rule.
  while root.previous_assignment_id is not null loop
    select * into prior from public.membership_classification_history where id=root.previous_assignment_id;
    if not found or prior.id=any(segment) then exit; end if;
    if prior.classification_id<>h.classification_id then previous_class:=prior.classification_id; exit; end if;
    root:=prior; segment:=array_append(segment,prior.id);
  end loop;
  select classification_move_back_enabled enabled,classification_move_back_min_ropings required into settings
    from public.producers where id=h.producer_id;
  select count(distinct er.id) into competed from public.competition_runs run
    join public.roping_entries e on e.id=run.entry_id
    join public.event_ropings er on er.id=e.event_roping_id
    where run.producer_id=h.producer_id and run.competed_assignment_id=any(segment)
      and er.division_id=h.division_id and e.competition_status='active'
      and (run.status in ('complete','no_time') or (run.status='disqualified' and run.raw_time_seconds is not null));
  select reason,staff_label into exception from public.classification_move_back_exceptions where assignment_id=root.id;
  return jsonb_build_object('assignmentId',h.id,'moveAssignmentId',root.id,'divisionId',h.division_id,
    'classificationId',h.classification_id,'previousClassificationId',previous_class,'effectiveOn',root.effective_on,
    'enabled',settings.enabled,'hasMove',previous_class is not null,'requiredRopings',settings.required,
    'completedRopings',competed,'exceptionReason',exception.reason,'exceptionStaff',exception.staff_label,
    'eligible',not settings.enabled or previous_class is null or competed>=settings.required or exception.reason is not null,
    'divisionName',(select name from public.divisions where id=h.division_id),
    'classificationName',(select name from public.classifications where id=h.classification_id),
    'previousClassificationName',(select name from public.classifications where id=previous_class));
end;
$$;

create function public.member_move_back_progress(target_membership_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p uuid; result jsonb;
begin
  select producer_id into p from public.memberships where id=target_membership_id;
  if p is null or auth.uid() is null or not public.has_organization_access(p) then
    raise exception 'You do not have permission to read this member’s classification progress'; end if;
  select coalesce(jsonb_agg(private.classification_move_back_state(id) order by effective_on desc),'[]') into result
    from public.membership_classification_history where membership_id=target_membership_id and ended_on is null;
  return result;
end;
$$;

create function public.approve_move_back_exception(target_membership_id uuid,expected_assignment_id uuid,target_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p uuid; h public.membership_classification_history%rowtype; state jsonb; result uuid;
begin
  select producer_id into p from public.memberships where id=target_membership_id for update;
  if p is null or auth.uid() is null or not public.can_manage_organization(p) then
    raise exception 'Staff permission is required to approve an exception'; end if;
  select * into h from public.membership_classification_history where id=expected_assignment_id
    and membership_id=target_membership_id and ended_on is null for update;
  if not found then raise exception 'The classification has changed. Refresh before approving an exception.'; end if;
  if length(trim(coalesce(target_reason,''))) not between 5 and 2000 then raise exception 'Explain why this exception is approved'; end if;
  state:=private.classification_move_back_state(h.id);
  select id into result from public.classification_move_back_exceptions where assignment_id=(state->>'moveAssignmentId')::uuid;
  if found then return result; end if;
  if (state->>'eligible')::boolean then raise exception 'This member already meets the move-back requirement'; end if;
  insert into public.classification_move_back_exceptions(producer_id,membership_id,division_id,assignment_id,
    reason,required_ropings,completed_ropings,approved_by,staff_label)
  values(p,h.membership_id,h.division_id,(state->>'moveAssignmentId')::uuid,trim(target_reason),
    (state->>'requiredRopings')::integer,(state->>'completedRopings')::integer,auth.uid(),coalesce(auth.jwt()->>'email','Staff')) returning id into result;
  return result;
end;
$$;

create function public.stamp_competed_classification() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op='UPDATE' and old.first_competed_at is not null then
    new.first_competed_at:=old.first_competed_at; new.competed_assignment_id:=old.competed_assignment_id;
  elsif new.status in ('complete','no_time') or (new.status='disqualified' and new.raw_time_seconds is not null) then
    new.first_competed_at:=clock_timestamp();
    select h.id into new.competed_assignment_id from public.roping_entries e
      join public.event_ropings er on er.id=e.event_roping_id
      join public.membership_classification_history h on h.membership_id=e.membership_id and h.division_id=er.division_id
      where e.id=new.entry_id and h.effective_on<=er.scheduled_date and (h.ended_on is null or h.ended_on>=er.scheduled_date)
      order by h.effective_on desc,(h.ended_on is null) desc,h.created_at desc limit 1;
  else new.first_competed_at:=null; new.competed_assignment_id:=null; end if;
  return new;
end;
$$;
create trigger runs_stamp_competed_classification before insert or update on public.competition_runs
  for each row execute function public.stamp_competed_classification();

create function public.guard_classification_move_back() returns trigger
language plpgsql security definer set search_path = '' as $$
declare previous public.membership_classification_history%rowtype; state jsonb; target record; current_class record;
begin
  perform 1 from public.memberships where id=new.membership_id for update;
  select * into previous from public.membership_classification_history where membership_id=new.membership_id
    and division_id=new.division_id and producer_id=new.producer_id
    order by ended_at desc nulls last,created_at desc,effective_on desc,id desc limit 1;
  new.previous_assignment_id:=previous.id;
  if previous.id is null or previous.classification_id=new.classification_id then return new; end if;
  state:=private.classification_move_back_state(previous.id);
  if (state->>'eligible')::boolean then return new; end if;
  select rank,eligibility_type into target from public.classifications where id=new.classification_id;
  select rank,eligibility_type into current_class from public.classifications where id=previous.classification_id;
  if new.classification_id=(state->>'previousClassificationId')::uuid
    or (target.eligibility_type='skill' and current_class.eligibility_type='skill' and target.rank>current_class.rank and current_class.rank>0) then
    raise exception 'Move-back review requires % ropings after this move (% competed). Staff may approve a documented exception.',
      state->>'requiredRopings',state->>'completedRopings';
  end if;
  return new;
end;
$$;
create trigger classification_assignments_move_back_guard before insert on public.membership_classification_history
  for each row execute function public.guard_classification_move_back();
create function public.stamp_classification_end() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.ended_on is null then new.ended_at:=null;
  elsif old.ended_on is null then new.ended_at:=clock_timestamp();
  else new.ended_at:=old.ended_at; end if;
  return new;
end;
$$;
create trigger classifications_stamp_end before update on public.membership_classification_history
  for each row execute function public.stamp_classification_end();
revoke all on function private.classification_move_back_state(uuid),public.stamp_competed_classification(),
  public.guard_classification_move_back(),public.stamp_classification_end() from public,anon,authenticated;
revoke all on function public.member_move_back_progress(uuid),public.approve_move_back_exception(uuid,uuid,text) from public,anon;
grant execute on function public.member_move_back_progress(uuid),public.approve_move_back_exception(uuid,uuid,text) to authenticated;
