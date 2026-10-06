alter table public.producers add column classification_watch_enabled boolean not null default false;

create table public.classification_watch_rules (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete cascade,
  division_id uuid not null,
  classification_id uuid not null,
  name text not null check (length(trim(name)) between 1 and 100),
  threshold_seconds numeric(8,2) not null check (threshold_seconds > 0),
  inclusive boolean not null default true,
  time_basis text not null default 'final' check (time_basis in ('raw','final')),
  review_count integer not null default 3 check (review_count between 1 and 100),
  proposed_classification_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, producer_id),
  foreign key (classification_id,producer_id,division_id) references public.classifications(id,producer_id,division_id),
  foreign key (proposed_classification_id,producer_id,division_id) references public.classifications(id,producer_id,division_id)
);
create table public.classification_run_flags (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete cascade,
  rule_id uuid,
  run_id uuid not null references public.competition_runs(id) on delete cascade,
  membership_id uuid not null,
  division_id uuid not null,
  assignment_id uuid references public.membership_classification_history(id) on delete set null,
  event_id uuid not null references public.events(id) on delete cascade,
  event_roping_id uuid not null references public.event_ropings(id) on delete cascade,
  round_number integer not null,
  occurred_on date not null,
  measured_seconds numeric(8,2) not null,
  rule_snapshot jsonb not null,
  is_active boolean not null default true,
  cleared_reason text,
  recorded_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rule_id,run_id),
  foreign key(rule_id,producer_id) references public.classification_watch_rules(id,producer_id),
  foreign key(membership_id,producer_id) references public.memberships(id,producer_id),
  foreign key(division_id,producer_id) references public.divisions(id,producer_id)
);
create index classification_run_flags_queue on public.classification_run_flags(producer_id,created_at desc);
alter table public.classification_watch_rules enable row level security;
alter table public.classification_run_flags enable row level security;
create policy "Staff read watch rules" on public.classification_watch_rules for select to authenticated
  using(public.has_organization_access(producer_id));
create policy "Managers create watch rules" on public.classification_watch_rules for insert to authenticated
  with check(public.can_manage_organization(producer_id));
create policy "Managers update watch rules" on public.classification_watch_rules for update to authenticated
  using(public.can_manage_organization(producer_id)) with check(public.can_manage_organization(producer_id));
create policy "Managers delete watch rules" on public.classification_watch_rules for delete to authenticated
  using(public.can_manage_organization(producer_id));
create policy "Staff read run flags" on public.classification_run_flags for select to authenticated
  using(public.has_organization_access(producer_id));
create trigger watch_rules_updated before update on public.classification_watch_rules
  for each row execute function public.set_updated_at();
create trigger run_flags_updated before update on public.classification_run_flags
  for each row execute function public.set_updated_at();
create trigger audit_watch_rules after insert or update or delete on public.classification_watch_rules
  for each row execute function public.write_audit_log();
create trigger audit_run_flags after insert or update or delete on public.classification_run_flags
  for each row execute function public.write_audit_log();

create function public.evaluate_classification_run_watch() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  rule record;
  snapshot jsonb;
  measured numeric;
  qualified boolean;
begin
  select e.membership_id,e.competition_status,e.handicap_time_credit_seconds,
    er.division_id,er.classification_id,er.scheduled_date,er.event_id,p.classification_watch_enabled
  into r from public.roping_entries e
    join public.event_ropings er on er.id=e.event_roping_id
    join public.producers p on p.id=e.producer_id where e.id=new.entry_id;
  if r.membership_id is null then return new; end if;
  -- Serialize concurrent timer desks for the same member before counting evidence.
  perform 1 from public.memberships where id=r.membership_id for update;
  for rule in
    select w.*,f.id flag_id,f.rule_snapshot saved_snapshot from public.classification_watch_rules w
    left join public.classification_run_flags f on f.rule_id=w.id and f.run_id=new.id
    where w.producer_id=new.producer_id and
      ((w.is_active and w.classification_id=r.classification_id and r.classification_watch_enabled) or f.id is not null)
  loop
    snapshot := coalesce(rule.saved_snapshot,jsonb_build_object('name',rule.name,
      'threshold_seconds',rule.threshold_seconds,'inclusive',rule.inclusive,'time_basis',rule.time_basis,
      'review_count',rule.review_count,'proposed_classification_id',rule.proposed_classification_id));
    measured := case when snapshot->>'time_basis'='raw' then new.raw_time_seconds
      else round(greatest(new.raw_time_seconds+new.penalty_seconds-r.handicap_time_credit_seconds,0),2) end;
    qualified := new.status='complete' and new.raw_time_seconds is not null and r.competition_status='active'
      and case when (snapshot->>'inclusive')::boolean then measured <= (snapshot->>'threshold_seconds')::numeric
        else measured < (snapshot->>'threshold_seconds')::numeric end;
    if rule.flag_id is not null then
      update public.classification_run_flags set measured_seconds=coalesce(measured,measured_seconds),
        is_active=qualified,cleared_reason=case when qualified then null else 'Run corrected or no longer qualified' end
        where id=rule.flag_id and (is_active is distinct from qualified or measured_seconds is distinct from coalesce(measured,measured_seconds));
    elsif qualified then
      insert into public.classification_run_flags(producer_id,rule_id,run_id,membership_id,division_id,
        assignment_id,event_id,event_roping_id,round_number,occurred_on,measured_seconds,rule_snapshot,recorded_by)
      values(new.producer_id,rule.id,new.id,r.membership_id,r.division_id,
        (select h.id from public.membership_classification_history h where h.membership_id=r.membership_id
          and h.division_id=r.division_id and h.effective_on<=r.scheduled_date
          and (h.ended_on is null or h.ended_on>=r.scheduled_date) order by h.effective_on desc,h.created_at desc limit 1),
        r.event_id,new.event_roping_id,new.round_number,r.scheduled_date,measured,snapshot,auth.uid());
    end if;
  end loop;
  return new;
end;
$$;
create trigger competition_runs_classification_watch after insert or update of status,raw_time_seconds,penalty_seconds
  on public.competition_runs for each row execute function public.evaluate_classification_run_watch();

create function public.clear_withdrawn_classification_flags() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.competition_status <> 'active' or new.event_roping_id <> old.event_roping_id then
    update public.classification_run_flags set is_active=false,cleared_reason='Entry withdrawn or transferred'
      where run_id in(select id from public.competition_runs where entry_id=new.id) and is_active;
  end if;
  return new;
end;
$$;
create trigger entries_clear_classification_flags after update of competition_status,event_roping_id
  on public.roping_entries for each row execute function public.clear_withdrawn_classification_flags();

create function public.archive_deleted_watch_rule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.classification_run_flags set rule_id=null,is_active=false,cleared_reason='Rule deleted'
    where rule_id=old.id;
  return old;
end;
$$;
create trigger watch_rule_archive before delete on public.classification_watch_rules
  for each row execute function public.archive_deleted_watch_rule();
create function public.acknowledge_classification_watch(target_membership_id uuid,target_division_id uuid,target_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare p uuid;
begin
  select producer_id into p from public.memberships where id=target_membership_id for update;
  if p is null or auth.uid() is null or not public.can_manage_organization(p) then
    raise exception 'You do not have permission to review this member'; end if;
  if length(trim(coalesce(target_reason,''))) not between 5 and 2000 then
    raise exception 'Explain the staff decision'; end if;
  update public.classification_run_flags set reviewed_at=now(),reviewed_by=auth.uid(),review_reason=trim(target_reason)
    where producer_id=p and membership_id=target_membership_id and division_id=target_division_id
      and is_active and reviewed_at is null;
end;
$$;
revoke all on function public.acknowledge_classification_watch(uuid,uuid,text) from public,anon;
grant execute on function public.acknowledge_classification_watch(uuid,uuid,text) to authenticated;
revoke all on function public.evaluate_classification_run_watch(),public.clear_withdrawn_classification_flags(),
  public.archive_deleted_watch_rule() from public,anon,authenticated;
