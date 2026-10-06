begin;
do $$
declare
  p uuid:='8f96f20f-932b-45ae-ac93-9832818de64d'; actor uuid; f record; target uuid; moved uuid; repeated uuid; state jsonb; rejected boolean; fresh uuid;
begin
  select user_id into actor from public.producer_staff where producer_id=p and role='owner' limit 1;
  perform set_config('request.jwt.claim.sub',actor::text,true);
  select run.id,run.entry_id,e.membership_id,er.division_id,er.scheduled_date,h.classification_id
    into f from public.competition_runs run join public.roping_entries e on e.id=run.entry_id
    join public.event_ropings er on er.id=run.event_roping_id join public.events ev on ev.id=er.event_id
    join public.membership_classification_history h on h.membership_id=e.membership_id and h.division_id=er.division_id and h.ended_on is null
    join public.classifications c on c.id=h.classification_id
    where ev.slug='test-suite-v2-live' and c.eligibility_type='skill' and c.rank>0
      and run.first_competed_at is null and exists(select 1 from public.competition_runs r where r.entry_id=run.entry_id and r.id<>run.id and r.first_competed_at is null) limit 1;
  if f.id is null then raise exception 'Missing live fixture'; end if;
  select id into target from public.classifications where producer_id=p and division_id=f.division_id and eligibility_type='skill' and is_active and id<>f.classification_id order by rank limit 1;
  update public.producers set classification_move_back_enabled=true,classification_move_back_min_ropings=2 where id=p;
  update public.competition_runs set status='complete',raw_time_seconds=12.34 where id=f.id;
  moved:=public.set_member_classification(p,f.membership_id,target,f.scheduled_date,'Move-back test move',null);
  state:=private.classification_move_back_state(moved);
  if (state->>'eligible')::boolean or (state->>'completedRopings')::int<>0 then raise exception 'Old runs counted toward new move'; end if;
  rejected:=false;
  begin perform public.set_member_classification(p,f.membership_id,f.classification_id,f.scheduled_date,'Premature move back',null);
  exception when others then
    if sqlerrm not like 'Move-back review requires%' then raise; end if;
    rejected:=true;
  end;
  if not rejected then raise exception 'Premature move back permitted'; end if;
  update public.competition_runs set raw_time_seconds=12.35 where id=f.id;
  state:=private.classification_move_back_state(moved);
  if (state->>'completedRopings')::int<>0 then raise exception 'Correction counted an old run'; end if;
  select id into fresh from public.competition_runs where entry_id=f.entry_id and first_competed_at is null limit 1;
  update public.competition_runs set status='turned_out' where id=fresh;
  state:=private.classification_move_back_state(moved);
  if (state->>'completedRopings')::int<>0 then raise exception 'Turnout counted'; end if;
  update public.competition_runs set status='no_time' where id=fresh;
  state:=private.classification_move_back_state(moved);
  if (state->>'completedRopings')::int<>1 then raise exception 'Attempted roping not counted once'; end if;
  update public.competition_runs set status='complete',raw_time_seconds=13.45 where entry_id=f.entry_id and id<>f.id;
  state:=private.classification_move_back_state(moved);
  if (state->>'completedRopings')::int<>1 then raise exception 'Multiple rounds inflated count'; end if;
  repeated:=public.set_member_classification(p,f.membership_id,target,f.scheduled_date,'Same class reassignment',null);
  state:=private.classification_move_back_state(repeated);
  if (state->>'eligible')::boolean or (state->>'moveAssignmentId')::uuid<>moved then raise exception 'Same class bypassed requirement'; end if;
  rejected:=false;
  begin perform public.approve_move_back_exception(f.membership_id,moved,'Stale assignment exception');
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Stale exception accepted'; end if;
  perform public.approve_move_back_exception(f.membership_id,repeated,'Staff approved an early reassessment for this test');
  state:=private.classification_move_back_state(repeated);
  if not (state->>'eligible')::boolean or state->>'exceptionReason' is null then raise exception 'Exception not reflected'; end if;
  perform public.set_member_classification(p,f.membership_id,f.classification_id,f.scheduled_date,'Approved move back',null);
  update public.producers set classification_move_back_enabled=false where id=p;
  perform public.set_member_classification(p,f.membership_id,target,f.scheduled_date,'Disabled requirement allows move',null);
  perform public.set_member_classification(p,f.membership_id,f.classification_id,f.scheduled_date,'Disabled requirement allows return',null);
  raise notice 'Move-back guards, same-class protection, exceptions and disabled mode passed';
end;
$$;
rollback;
