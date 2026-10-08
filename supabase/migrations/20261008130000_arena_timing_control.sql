-- Event assignments scope the desk; timing sessions protect each individual roping.
alter table public.staff_event_assignments add column arena_number integer check (arena_number > 0);

create function public.assign_staff_arena(target_producer uuid, target_event uuid, target_user uuid, target_arena integer)
returns void language plpgsql security definer set search_path='' as $$
declare arenas integer;
begin
  if not public.can_administer_organization(target_producer) then raise exception 'Only an owner or administrator can assign arenas'; end if;
  select arena_count into arenas from public.events where id=target_event and producer_id=target_producer for update;
  if arenas is null or (target_arena is not null and (target_arena < 1 or target_arena > arenas)) then raise exception 'Choose an arena from this event'; end if;
  update public.staff_event_assignments set arena_number=target_arena where producer_id=target_producer and event_id=target_event and user_id=target_user;
  if not found then raise exception 'Assign this staff member to the event first'; end if;
end;
$$;

create or replace function public.can_time_roping(target_roping uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.event_ropings r where r.id=target_roping
    and r.arena_name ~ '^Arena [1-9][0-9]*$'
    and public.can_time_event(r.event_id)
    and (public.can_manage_event(r.event_id) or exists (
      select 1 from public.staff_event_assignments a where a.event_id=r.event_id
        and a.producer_id=r.producer_id and a.user_id=auth.uid()
        and (a.arena_number is null or r.arena_name='Arena ' || a.arena_number::text)
    )));
$$;

create table public.roping_timing_sessions (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete cascade,
  event_roping_id uuid not null unique references public.event_ropings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  expires_at timestamptz not null,
  reason text not null
);
alter table public.roping_timing_sessions enable row level security;
revoke all on public.roping_timing_sessions from public, anon, authenticated;
create function public.audit_timing_session() returns trigger
language plpgsql security definer set search_path='' as $$
declare before_record jsonb; after_record jsonb;
begin
  before_record:=case when tg_op in ('UPDATE','DELETE') then to_jsonb(old)-'session_id' else null end;
  after_record:=case when tg_op in ('INSERT','UPDATE') then to_jsonb(new)-'session_id' else null end;
  insert into public.producer_audit_log(producer_id,actor_user_id,entity_type,entity_id,action,before_data,after_data)
    values(coalesce(new.producer_id,old.producer_id),auth.uid(),'roping_timing_sessions',coalesce(new.id,old.id),lower(tg_op),before_record,after_record);
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.audit_timing_session() from public,anon,authenticated;
create trigger audit_timing_session_claim after insert or delete on public.roping_timing_sessions
for each row execute function public.audit_timing_session();
create trigger audit_timing_session_takeover after update on public.roping_timing_sessions
for each row when (old.session_id is distinct from new.session_id or old.user_id is distinct from new.user_id)
execute function public.audit_timing_session();

create function public.manage_roping_timing(target_roping uuid, browser_session uuid, operation text default 'status', takeover_reason text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.event_ropings%rowtype; lease public.roping_timing_sessions%rowtype; holder text; allowed boolean;
begin
  if auth.uid() is null or browser_session is null then raise exception 'Sign in before using the timing desk'; end if;
  select * into r from public.event_ropings where id=target_roping for update;
  if r.id is null or not public.has_organization_access(r.producer_id) then raise exception 'This roping is not available'; end if;
  allowed := public.can_time_roping(r.id);
  select * into lease from public.roping_timing_sessions where event_roping_id=r.id;
  if operation='release' then
    if lease.user_id=auth.uid() and lease.session_id=browser_session then
      delete from public.roping_timing_sessions where id=lease.id;
    end if;
  elsif operation='renew' then
    if not allowed or lease.user_id is distinct from auth.uid() or lease.session_id is distinct from browser_session or lease.expires_at <= clock_timestamp() then
      raise exception 'Timing control was lost. Your unsaved readings have not been submitted';
    end if;
    update public.roping_timing_sessions set expires_at=clock_timestamp()+interval '90 seconds' where id=lease.id;
  elsif operation in ('claim','takeover') then
    if not allowed then raise exception 'Assign this roping to your arena before taking timing control'; end if;
    if not exists(select 1 from public.events e where e.id=r.event_id and e.status='in_progress') or r.event_day_status='completed' then
      raise exception 'Timing control is only available for an active event and unfinished roping';
    end if;
    if operation='takeover' then
      if not public.can_manage_event(r.event_id) then raise exception 'Only an event manager can take over timing'; end if;
      if length(trim(coalesce(takeover_reason,''))) < 5 then raise exception 'Explain why timing control is being taken over'; end if;
    elsif lease.expires_at > clock_timestamp() and (lease.user_id is distinct from auth.uid() or lease.session_id is distinct from browser_session) then
      raise exception 'Another timing session is active. Ask them to release control';
    end if;
    insert into public.roping_timing_sessions(producer_id,event_roping_id,user_id,session_id,expires_at,reason)
    values(r.producer_id,r.id,auth.uid(),browser_session,clock_timestamp()+interval '90 seconds',
      case when operation='takeover' then trim(takeover_reason) else 'Timing control acquired' end)
    on conflict(event_roping_id) do update set user_id=excluded.user_id,session_id=excluded.session_id,expires_at=excluded.expires_at,reason=excluded.reason;
  elsif operation <> 'status' then raise exception 'Unknown timing operation'; end if;
  select * into lease from public.roping_timing_sessions where event_roping_id=r.id;
  select coalesce(display_name,email,'Staff member') into holder from public.producer_staff_directory where producer_id=r.producer_id and user_id=lease.user_id;
  return jsonb_build_object('ownsControl',allowed and lease.user_id=auth.uid() and lease.session_id=browser_session and lease.expires_at > clock_timestamp(),
    'holder',case when lease.expires_at > clock_timestamp() then coalesce(holder,'Staff member') else null end,
    'remainingSeconds',greatest(0,coalesce(extract(epoch from lease.expires_at-clock_timestamp()),0)), 'allowed',allowed);
end;
$$;

create schema timing_private;
revoke all on schema timing_private from public,anon,authenticated;
create function timing_private.assert_control(target_run uuid, browser_session uuid) returns void
language plpgsql security definer set search_path='' as $$
declare roping_id uuid;
begin
  select event_roping_id into roping_id from public.competition_runs where id=target_run;
  perform 1 from public.event_ropings where id=roping_id for update;
  if browser_session is null or not public.can_time_run(target_run) or not exists(
    select 1 from public.roping_timing_sessions where event_roping_id=roping_id and user_id=auth.uid()
      and session_id=browser_session and expires_at > clock_timestamp()
  ) then raise exception 'Take timing control before saving. Another session may have taken over; your readings were not saved'; end if;
end;
$$;
alter function public.save_run_with_penalties(uuid,numeric[],text[],public.run_status,text) set schema timing_private;
alter function public.schedule_run_rerun(uuid,public.rerun_timing,text) set schema timing_private;
revoke all on all functions in schema timing_private from public,anon,authenticated;

create function public.save_run_with_penalties(target_run_id uuid, entered_timer_readings numeric[], selected_penalty_ids text[], entered_status public.run_status,
  entered_reason text default null, timing_session_id uuid default null)
returns numeric language plpgsql security definer set search_path='' as $$
begin
  perform timing_private.assert_control(target_run_id,timing_session_id);
  return timing_private.save_run_with_penalties(target_run_id,entered_timer_readings,selected_penalty_ids,entered_status,entered_reason);
end;
$$;
create function public.schedule_run_rerun(target_run_id uuid,target_timing public.rerun_timing,entered_reason text,timing_session_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
begin
  perform timing_private.assert_control(target_run_id,timing_session_id);
  return timing_private.schedule_run_rerun(target_run_id,target_timing,entered_reason);
end;
$$;
revoke all on function public.record_run_result(uuid,numeric,numeric,public.run_status) from public,anon,authenticated;
revoke insert,update,delete,truncate,references,trigger on public.competition_runs,public.run_timer_readings from authenticated,anon;
revoke all on function public.assign_staff_arena(uuid,uuid,uuid,integer),public.manage_roping_timing(uuid,uuid,text,text),
 public.save_run_with_penalties(uuid,numeric[],text[],public.run_status,text,uuid),public.schedule_run_rerun(uuid,public.rerun_timing,text,uuid) from public,anon;
grant execute on function public.assign_staff_arena(uuid,uuid,uuid,integer),public.manage_roping_timing(uuid,uuid,text,text),
 public.save_run_with_penalties(uuid,numeric[],text[],public.run_status,text,uuid),public.schedule_run_rerun(uuid,public.rerun_timing,text,uuid) to authenticated;
notify pgrst,'reload schema';
