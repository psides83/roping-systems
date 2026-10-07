create table public.finals_position_assignments (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id),
  season_id uuid not null references public.producer_seasons(id),
  membership_id uuid not null references public.memberships(id),
  award_key text not null,
  position_number integer not null check(position_number between 1 and 1000),
  assigned_class_key text not null,
  event_roping_id uuid references public.event_ropings(id),
  assigned_at timestamptz,
  changed_by uuid not null references auth.users(id),
  reason text not null check(length(trim(reason)) between 5 and 2000),
  unique(producer_id,season_id,award_key,position_number),
  check((event_roping_id is null)=(assigned_at is null))
);
alter table public.finals_position_assignments enable row level security;
revoke all on public.finals_position_assignments from anon,authenticated;
grant select on public.finals_position_assignments to authenticated;
create policy "Staff read finals assignments" on public.finals_position_assignments for select to authenticated using(public.has_organization_access(producer_id));
create trigger audit_finals_assignments after insert or update on public.finals_position_assignments for each row execute function public.write_audit_log();
create trigger standings_changed_finals_assignments after insert or update on public.finals_position_assignments for each row execute function public.invalidate_qualification_standings();

create function public.assign_finals_position(target_producer_id uuid,target_season_id uuid,target_membership_id uuid,
  target_award_key text,target_position_number integer,target_class_key text,target_roping_id uuid,
  expected_revision bigint,assignment_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare season public.producer_seasons%rowtype; current_assignment public.finals_position_assignments%rowtype;
  target public.event_ropings%rowtype; previous public.event_ropings%rowtype; revision bigint; maximum integer; member uuid; today date; source_id uuid; source_entry uuid;
begin
  if auth.uid() is null or not public.can_manage_organization(target_producer_id) then raise exception 'Producer management access is required'; end if;
  perform 1 from public.event_ropings where producer_id=target_producer_id and id in (target_roping_id,
    (select event_roping_id from public.finals_position_assignments where producer_id=target_producer_id and season_id=target_season_id and award_key=target_award_key and position_number=target_position_number)) order by id for update;
  -- Serialize assignment changes so one position cannot be claimed by two events.
  select standings_revision into revision from public.producers where id=target_producer_id for update;
  if revision is distinct from expected_revision then raise exception 'Finals positions changed. Refresh and try again'; end if;
  select * into season from public.producer_seasons where id=target_season_id and producer_id=target_producer_id;
  select roper_id into member from public.memberships where id=target_membership_id and producer_id=target_producer_id;
  if season.id is null or member is null then raise exception 'Choose this producer''s season and member'; end if;
  if not exists(select 1 from public.classifications where producer_id=target_producer_id and id::text=target_class_key)
    and not exists(select 1 from public.divisions where producer_id=target_producer_id and target_class_key in (id::text||':handicap',id::text||':four_d')) then raise exception 'Choose a finals class belonging to this producer'; end if;
  if length(trim(coalesce(assignment_reason,''))) not between 5 and 2000 then raise exception 'Provide an assignment reason'; end if;
  if target_award_key like 'manual:%' then
    source_id:=split_part(target_award_key,':',2)::uuid;
    select positions into maximum from public.manual_finals_positions where id=source_id and producer_id=target_producer_id and season_id=season.id and membership_id=target_membership_id and not revoked;
  elsif target_award_key like 'finish:%' then
    source_id:=split_part(target_award_key,':',2)::uuid;
    source_entry:=split_part(target_award_key,':',3)::uuid;
    select max((place->>'positions')::integer) into maximum from public.finals_qualification_rules q
      join public.event_ropings r on r.id=q.event_roping_id
      join public.roping_entries e on e.id=source_entry and e.event_roping_id=r.id and e.membership_id=target_membership_id
      cross join lateral jsonb_array_elements(q.places) place
      where q.id=source_id and q.producer_id=target_producer_id and q.season_id=season.id and q.enabled and r.result_status='official' and e.competition_status='active';
  end if;
  if maximum is null or target_position_number not between 1 and maximum then raise exception 'This earned position is no longer available'; end if;
  select * into current_assignment from public.finals_position_assignments where producer_id=target_producer_id and season_id=season.id and award_key=target_award_key and position_number=target_position_number for update;
  if current_assignment.id is not null and current_assignment.membership_id<>target_membership_id then raise exception 'This position belongs to another member'; end if;
  if current_assignment.id is not null and current_assignment.event_roping_id is not distinct from target_roping_id and current_assignment.assigned_class_key=target_class_key then return; end if;
  if current_assignment.event_roping_id is not null then
    select * into previous from public.event_ropings where id=current_assignment.event_roping_id for update;
    if previous.event_day_status in ('in_progress','completed') or previous.payouts_finalized_at is not null
      or exists(select 1 from public.competition_runs where event_roping_id=previous.id and status<>'pending') then raise exception 'A position cannot be moved after its target roping starts'; end if;
    if previous.max_entries_per_roper is not null and (select count(*) from public.roping_entries where event_roping_id=previous.id and roper_id=member and competition_status='active')>previous.max_entries_per_roper then raise exception 'Withdraw the accepted bonus entries before changing their assignments'; end if;
  end if;
  select (now() at time zone timezone)::date into today from public.producers where id=target_producer_id;
  if current_assignment.event_roping_id is null and today>season.ends_on then raise exception 'Unassigned positions expired at the end of this season'; end if;
  if target_roping_id is not null then
    select * into target from public.event_ropings where id=target_roping_id and producer_id=target_producer_id for update;
    if target.id is null or target.scheduled_date<today or target.event_day_status in ('in_progress','completed') or target.payouts_finalized_at is not null
      or exists(select 1 from public.events where id=target.event_id and status in ('completed','cancelled'))
      or exists(select 1 from public.competition_runs where event_roping_id=target.id and status<>'pending') then raise exception 'Choose a scheduled roping that has not started'; end if;
    if (case when target.competition_format in ('handicap','four_d') then target.division_id::text||':'||target.competition_format else target.classification_id::text end) is distinct from target_class_key then raise exception 'The target roping must match the member''s finals class'; end if;
    if not exists(select 1 from public.roping_qualification_checks where event_roping_id=target.id and season_id=season.id and class_key=target_class_key and bonus_entries_enabled) then raise exception 'Enable earned bonus entries for this season in the target roping''s qualification setup first'; end if;
  end if;
  insert into public.finals_position_assignments(producer_id,season_id,membership_id,award_key,position_number,assigned_class_key,event_roping_id,assigned_at,changed_by,reason)
  values(target_producer_id,season.id,target_membership_id,target_award_key,target_position_number,target_class_key,target_roping_id,case when target_roping_id is not null then now() end,auth.uid(),trim(assignment_reason))
  on conflict(producer_id,season_id,award_key,position_number) do update set assigned_class_key=excluded.assigned_class_key,event_roping_id=excluded.event_roping_id,assigned_at=excluded.assigned_at,changed_by=excluded.changed_by,reason=excluded.reason;
end;
$$;
revoke all on function public.assign_finals_position(uuid,uuid,uuid,text,integer,text,uuid,bigint,text) from public,anon;
grant execute on function public.assign_finals_position(uuid,uuid,uuid,text,integer,text,uuid,bigint,text) to authenticated;

-- Existing qualification checks must be rebuilt using assigned, not all earned, positions.
update public.producers p set standings_revision=standings_revision+1
where exists(select 1 from public.roping_qualification_checks q where q.producer_id=p.id and q.bonus_entries_enabled);
