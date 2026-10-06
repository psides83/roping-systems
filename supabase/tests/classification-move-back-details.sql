begin;
do $$
declare
  p uuid:='8f96f20f-932b-45ae-ac93-9832818de64d'; actor uuid; f record; target uuid; moved uuid;
  entry_copy public.roping_entries%rowtype; run_copy public.competition_runs%rowtype;
  roping_copy public.event_ropings%rowtype; source_entry uuid; source_run uuid; source_roping uuid;
  details jsonb; progress jsonb; rejected boolean; exception_id uuid;
begin
  select user_id into actor from public.producer_staff where producer_id=p and role='owner' limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  select run.id,run.entry_id,run.event_roping_id,e.membership_id,er.division_id,er.scheduled_date,h.classification_id
    into f from public.competition_runs run join public.roping_entries e on e.id=run.entry_id
    join public.event_ropings er on er.id=run.event_roping_id join public.events ev on ev.id=er.event_id
    join public.membership_classification_history h on h.membership_id=e.membership_id and h.division_id=er.division_id and h.ended_on is null
    join public.classifications c on c.id=h.classification_id
    where ev.slug='test-suite-v2-live' and c.eligibility_type='skill' and c.rank>0 and run.first_competed_at is null limit 1;
  if f.id is null then raise exception 'Missing live fixture'; end if;
  source_entry:=f.entry_id; source_run:=f.id; source_roping:=f.event_roping_id;
  select id into target from public.classifications where producer_id=p and division_id=f.division_id and eligibility_type='skill' and is_active and id<>f.classification_id order by rank limit 1;
  update public.producers set classification_move_back_enabled=true,classification_move_back_min_ropings=2 where id=p;
  select * into entry_copy from public.roping_entries where id=source_entry;
  entry_copy.id:=gen_random_uuid();
  select max(entry_number)+1 into entry_copy.entry_number from public.roping_entries where event_roping_id=source_roping and roper_id=entry_copy.roper_id;
  insert into public.roping_entries select (entry_copy).*;
  moved:=public.set_member_classification(p,f.membership_id,target,f.scheduled_date,'Participation detail test move',null);
  update public.competition_runs set status='complete',raw_time_seconds=12.34 where id=source_run;
  select * into run_copy from public.competition_runs where id=source_run;
  run_copy.id:=gen_random_uuid(); run_copy.entry_id:=entry_copy.id; run_copy.draw_position:=null;
  run_copy.first_competed_at:=null; run_copy.competed_assignment_id:=null;
  insert into public.competition_runs select (run_copy).*;
  details:=public.member_move_back_details(f.membership_id);
  select value into progress from jsonb_array_elements(details->'progress') where value->>'divisionId'=f.division_id::text;
  if (progress->>'completedRopings')::int<>1 or jsonb_array_length(progress->'participation')<>1
    or (progress->'participation'->0->>'qualifiedRuns')::int<>2 then raise exception 'Multiple entries inflated roping count or details disagree'; end if;
  if not (progress->'moveBackTargetIds') ? f.classification_id::text then raise exception 'Previous class missing from move-back targets'; end if;
  select * into roping_copy from public.event_ropings where id=source_roping;
  roping_copy.id:=gen_random_uuid(); roping_copy.name:='Rollback-only participation fixture';
  roping_copy.classification_id:=target;
  insert into public.event_ropings select (roping_copy).*;
  entry_copy.id:=gen_random_uuid(); entry_copy.event_roping_id:=roping_copy.id; entry_copy.entry_number:=1;
  insert into public.roping_entries select (entry_copy).*;
  run_copy.id:=gen_random_uuid(); run_copy.entry_id:=entry_copy.id; run_copy.event_roping_id:=roping_copy.id;
  run_copy.status:='no_time'; run_copy.raw_time_seconds:=null;
  insert into public.competition_runs select (run_copy).*;
  details:=public.member_move_back_details(f.membership_id);
  select value into progress from jsonb_array_elements(details->'progress') where value->>'divisionId'=f.division_id::text;
  if (progress->>'completedRopings')::int<>2 or jsonb_array_length(progress->'participation')<>2
    or not (progress->>'eligible')::boolean then raise exception 'Separate roping did not unlock review'; end if;
  if not exists(select 1 from jsonb_array_elements(progress->'participation') row where row->>'ropingId'=roping_copy.id::text and (row->>'noTimeRuns')::int=1) then raise exception 'No-time evidence absent'; end if;
  update public.producers set classification_move_back_min_ropings=3 where id=p;
  update public.producer_staff set role='viewer' where producer_id=p and user_id=actor;
  perform public.member_move_back_details(f.membership_id);
  rejected:=false;
  begin perform public.approve_move_back_exception(f.membership_id,moved,'Viewer must not approve an exception');
  exception when others then if sqlerrm not like 'Staff permission%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Viewer approved exception'; end if;
  update public.producer_staff set role='owner' where producer_id=p and user_id=actor;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  rejected:=false;
  begin perform public.member_move_back_details(f.membership_id);
  exception when others then if sqlerrm not like 'You do not have permission%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Unrelated user read producer member details'; end if;
  rejected:=false;
  begin perform public.approve_move_back_exception(f.membership_id,moved,'Unrelated user must not approve');
  exception when others then if sqlerrm not like 'Staff permission%' then raise; end if; rejected:=true; end;
  if not rejected then raise exception 'Unrelated user approved exception'; end if;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  exception_id:=public.approve_move_back_exception(f.membership_id,moved,'Staff reviewed participation and approved this exception');
  if not exists(select 1 from public.classification_move_back_exceptions where id=exception_id and approved_by=actor and completed_ropings=2 and required_ropings=3) then raise exception 'Exception snapshot or actor missing'; end if;
  perform public.set_member_classification(p,f.membership_id,f.classification_id,f.scheduled_date,'Approved return after exception',null);
  details:=public.member_move_back_details(f.membership_id);
  if jsonb_array_length(details->'exceptions')<>1 or details->'exceptions'->0->>'id'<>exception_id::text
    or details->'exceptions'->0->>'reason'<>'Staff reviewed participation and approved this exception' then raise exception 'Exception history disappeared after subsequent move'; end if;
  select value into progress from jsonb_array_elements(details->'progress') where value->>'divisionId'=f.division_id::text;
  if progress->>'exceptionReason' is not null or (progress->>'completedRopings')::int<>0 then raise exception 'Previous exception or participation carried into next move'; end if;
end;
$$;
select 'Participation details, multiple entries, separate ropings, producer permissions and persistent exception history passed' result;
rollback;
