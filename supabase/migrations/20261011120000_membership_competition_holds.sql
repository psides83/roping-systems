-- Registration is distinct from clearance to compete. Existing approved
-- memberships are preserved; automatically enrolled ropers are never approved.
alter table public.memberships add column formally_approved boolean not null default true;
update public.memberships set formally_approved = (status = 'active');

create function public.requires_membership(target_producer uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select not exists(select 1 from public.producer_feature_preferences
    where producer_id=target_producer and features->>'require_memberships'='false')
$$;
revoke all on function public.requires_membership(uuid) from public,anon,authenticated;

create function public.record_membership_approval() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if public.requires_membership(new.producer_id) then
    new.formally_approved := new.status='active';
  end if;
  return new;
end $$;
revoke all on function public.record_membership_approval() from public,anon,authenticated;
create trigger membership_status_approval before update of status on public.memberships
for each row execute function public.record_membership_approval();

create function public.attach_entry_roper_record() returns trigger
language plpgsql security definer set search_path='' as $$
declare roping public.event_ropings%rowtype; record_id uuid;
begin
  select * into roping from public.event_ropings where id=new.event_roping_id;
  if roping.id is null or new.producer_id<>roping.producer_id then
    raise exception 'Roping and producer must match';
  end if;
  -- Serialize first-entry enrollment for the same producer and roper.
  perform pg_advisory_xact_lock(hashtextextended(roping.producer_id::text||new.roper_id::text,0));
  select id into record_id from public.memberships
    where producer_id=roping.producer_id and roper_id=new.roper_id;
  if record_id is null then
    insert into public.memberships(producer_id,roper_id,member_number,status,joined_on,formally_approved)
    values(roping.producer_id,new.roper_id,'R-'||replace(new.roper_id::text,'-',''),
      case when public.requires_membership(roping.producer_id) then 'pending'::public.membership_status
        else 'active'::public.membership_status end,current_date,false)
    returning id into record_id;
  end if;
  new.membership_id:=record_id;
  if roping.incentive_enabled then
    select a.classification_id,a.handicap_time_credit_seconds
      into new.handicap_classification_id,new.handicap_time_credit_seconds
      from public.event_roping_handicap_adjustments a
      join public.membership_classification_history h on h.classification_id=a.classification_id
        and h.membership_id=record_id and h.effective_on<=roping.scheduled_date
        and (h.ended_on is null or h.ended_on>=roping.scheduled_date)
      where a.event_roping_id=roping.id
      order by h.effective_on desc,h.created_at desc limit 1;
    new.handicap_time_credit_seconds:=coalesce(new.handicap_time_credit_seconds,0);
  end if;
  return new;
end $$;
revoke all on function public.attach_entry_roper_record() from public,anon,authenticated;
create trigger entries_attach_roper_record before insert or update of event_roping_id,roper_id
on public.roping_entries for each row execute function public.attach_entry_roper_record();

-- Keep the complete eligibility predicate for competition and previews.
alter function public.entry_classification_failure(public.roping_entries)
rename to entry_confirmed_classification_failure;
create function public.entry_classification_failure(new public.roping_entries)
returns text language plpgsql stable security definer set search_path='' as $$
declare failure text;
begin
  failure:=public.entry_confirmed_classification_failure(new);
  if failure like 'Contestant needs an active skill classification for the % division'
    or failure='The member needs a current classification included in this handicap setup' then
    return null;
  end if;
  return failure;
end $$;
revoke all on function public.entry_classification_failure(public.roping_entries) from public,anon,authenticated;

create function public.entry_competition_hold(target_entry uuid)
returns text language plpgsql stable security definer set search_path='' as $$
declare entry public.roping_entries%rowtype; member public.memberships%rowtype;
  roping public.event_ropings%rowtype; failure text;
begin
  select * into entry from public.roping_entries where id=target_entry;
  if entry.id is null then return 'Entry not found'; end if;
  select * into roping from public.event_ropings where id=entry.event_roping_id;
  select * into member from public.memberships where id=entry.membership_id;
  if public.requires_membership(entry.producer_id) and
    (member.id is null or not member.formally_approved or member.status<>'active'
      or (member.expires_on is not null and member.expires_on<roping.scheduled_date)) then
    return 'Membership approval required before competing';
  end if;
  if roping.incentive_enabled then
    select a.classification_id,a.handicap_time_credit_seconds
      into entry.handicap_classification_id,entry.handicap_time_credit_seconds
      from public.event_roping_handicap_adjustments a
      join public.membership_classification_history h on h.classification_id=a.classification_id
        and h.membership_id=entry.membership_id and h.effective_on<=roping.scheduled_date
        and (h.ended_on is null or h.ended_on>=roping.scheduled_date)
      where a.event_roping_id=roping.id order by h.effective_on desc,h.created_at desc limit 1;
  end if;
  failure:=public.entry_confirmed_classification_failure(entry);
  if failure is not null and (not entry.eligibility_overridden
    or failure like 'Contestant needs an active skill classification for the % division'
    or failure='The member needs a current classification included in this handicap setup') then
    return 'Classification or eligibility review required: '||failure;
  end if;
  return null;
end $$;
revoke all on function public.entry_competition_hold(uuid) from public,anon,authenticated;

create function public.event_entry_competition_holds(target_roping_id uuid)
returns table(entry_id uuid,membership_id uuid,hold_reason text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.event_ropings r join public.producer_staff s
    on s.producer_id=r.producer_id where r.id=target_roping_id
    and s.user_id=auth.uid()) then raise exception 'Event access required'; end if;
  return query select e.id,e.membership_id,public.entry_competition_hold(e.id)
    from public.roping_entries e where e.event_roping_id=target_roping_id;
end $$;
revoke all on function public.event_entry_competition_holds(uuid) from public,anon;
grant execute on function public.event_entry_competition_holds(uuid) to authenticated;

create function public.enforce_competition_clearance() returns trigger
language plpgsql security definer set search_path='' as $$
declare reason text;
begin
  if new.status in ('complete','no_time','disqualified') and
    (tg_op='INSERT' or old.status not in ('complete','no_time','disqualified')) then
    reason:=public.entry_competition_hold(new.entry_id);
    if reason is not null then raise exception '%',reason; end if;
  end if;
  return new;
end $$;
revoke all on function public.enforce_competition_clearance() from public,anon,authenticated;
create trigger a_competition_clearance before insert or update of status on public.competition_runs
for each row execute function public.enforce_competition_clearance();

-- Classification confirmation must refresh the handicap before the timing
-- function reads it, not after that function has calculated the result.
create function public.refresh_unstarted_entry_handicaps() returns trigger
language plpgsql security definer set search_path='' as $$
declare member_id uuid:=case when tg_op='DELETE' then old.membership_id else new.membership_id end;
begin
  update public.roping_entries e set
    handicap_classification_id=choice.classification_id,
    handicap_time_credit_seconds=coalesce(choice.handicap_time_credit_seconds,0)
  from public.event_ropings r
  left join lateral (
    select a.classification_id,a.handicap_time_credit_seconds
    from public.event_roping_handicap_adjustments a
    join public.membership_classification_history h on h.classification_id=a.classification_id
      and h.membership_id=member_id and h.effective_on<=r.scheduled_date
      and (h.ended_on is null or h.ended_on>=r.scheduled_date)
    where a.event_roping_id=r.id order by h.effective_on desc,h.created_at desc limit 1
  ) choice on true
  where e.membership_id=member_id and e.event_roping_id=r.id and r.incentive_enabled
    and r.event_day_status not in ('completed')
    and not exists(select 1 from public.competition_runs cr where cr.entry_id=e.id and cr.status<>'pending')
    and (e.handicap_classification_id is distinct from choice.classification_id
      or e.handicap_time_credit_seconds is distinct from coalesce(choice.handicap_time_credit_seconds,0));
  return null;
end $$;
revoke all on function public.refresh_unstarted_entry_handicaps() from public,anon,authenticated;
create trigger classification_refresh_unstarted_handicaps after insert or update or delete
on public.membership_classification_history for each row execute function public.refresh_unstarted_entry_handicaps();

-- Amend only registration gates; retain all existing authorization, limits,
-- request ownership, options, publication and date-window checks.
do $$
declare definition text; updated text;
begin
  select pg_get_functiondef('public.save_producer_features(uuid,integer,jsonb)'::regprocedure) into definition;
  updated:=replace(definition,'''membership'',''online_entries''','''require_memberships'',''membership'',''online_entries''');
  if updated=definition then raise exception 'Feature settings definition changed'; end if;
  execute updated;
  select pg_get_functiondef('public.public_producer_features(text)'::regprocedure) into definition;
  updated:=replace(definition,'''membership'',''online_entries''','''require_memberships'',''membership'',''online_entries''');
  if updated=definition then raise exception 'Public feature definition changed'; end if;
  execute updated;
  select pg_get_functiondef('public.submit_online_entry_request(text,text,text,text,text,text,text,text,jsonb)'::regprocedure) into definition;
  updated:=replace(definition,
    'if selected_membership_id is null and (not organization_record.allow_non_member_entries or not division_record.allow_non_members) then raise exception ''An active membership is required for one or more selected divisions''; end if;',
    '-- Membership approval is a competition hold, not a registration gate.');
  if updated=definition then raise exception 'Online registration definition changed'; end if;
  execute updated;
  select pg_get_functiondef('public.update_my_online_entry(uuid,integer,jsonb,text)'::regprocedure) into definition;
  updated:=replace(definition,
    'if not member_valid and (not roping.allow_non_members or not (select allow_non_member_entries from public.producers where id=submission.producer_id)) then raise exception ''An active membership is required for this roping''; end if;',
    '-- Membership approval is checked before competing.');
  if updated=definition then raise exception 'Online request revision definition changed'; end if;
  execute updated;
end $$;

create or replace function public.check_membership_application_feature() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.producers where id=new.producer_id for share;
  if not public.requires_membership(new.producer_id) or exists(select 1
    from public.producer_feature_preferences where producer_id=new.producer_id and features->>'membership'='false') then
    raise exception 'Online membership applications are not available. Contact the producer.';
  end if;
  return new;
end $$;
