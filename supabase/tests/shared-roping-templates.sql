begin;
do $$
declare
  p uuid; staff uuid; t public.roping_templates%rowtype; d uuid; c uuid;
  e uuid; r uuid; copied uuid; review jsonb; rejected boolean;
  h public.roping_templates%rowtype; hc uuid; hd uuid;
begin
  select producer_id,user_id into strict p,staff from public.producer_staff where role='owner' limit 1;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  select * into strict t from public.roping_templates where producer_id=p and competition_format='standard' and is_active limit 1;
  select division_id,id into strict d,c from public.classifications where producer_id=p and division_id<>t.division_id and is_active and standalone_enabled limit 1;
  update public.roping_templates set available_division_ids=array[t.division_id,d] where id=t.id;
  copied:=public.duplicate_division_template(p,t.id);
  if (select available_division_ids from public.roping_templates where id=copied)<>array[t.division_id,d] then raise exception 'Shared divisions not duplicated'; end if;
  insert into public.events(producer_id,title,slug,starts_at,ends_at,status,arena_count)
    values(p,'Shared template regression','shared-'||gen_random_uuid(),now(),now()+interval '1 day','draft',2) returning id into e;
  r:=public.add_roping_to_event(e,t.id,c,(now() at time zone (select timezone from public.producers where id=p))::date,
    'fixed',now() at time zone (select timezone from public.producers where id=p),'','Arena 1',t.main_round_count,false);
  if (select division_id from public.event_ropings where id=r)<>d then raise exception 'Scheduled division was overwritten'; end if;
  if public.get_event_template_reviews(e)<>'[]'::jsonb then raise exception 'Shared roping falsely differs from template: %',public.get_event_template_reviews(e); end if;
  update public.roping_templates set description=coalesce(description,'')||' updated' where id=t.id;
  review:=public.get_event_template_reviews(e)->0;
  perform public.confirm_event_roping_template_update(p,e,r,review->>'token',false,false);
  if (select division_id from public.event_ropings where id=r)<>d or public.get_event_template_reviews(e)<>'[]'::jsonb then raise exception 'Shared template refresh failed'; end if;
  rejected:=false;
  begin update public.roping_templates set available_division_ids=array[t.division_id,gen_random_uuid()] where id=t.id;
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Invalid division accepted'; end if;
  rejected:=false;
  begin update public.roping_templates set available_division_ids=array[t.division_id,t.division_id] where id=t.id;
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Duplicate divisions accepted'; end if;
  e:=public.create_roping_with_schedule(p,'Shared creation','shared-create-'||gen_random_uuid(),'','',now()::timestamp,(now()+interval '1 day')::timestamp,null,null,false,
    jsonb_build_array(jsonb_build_object('templateId',t.id,'classificationId',c,'scheduledDate',current_date,'scheduleType','fixed','startsAt',now()::timestamp,'roundCount',t.main_round_count,'incentiveEnabled',false)),false,'[]',null,null);
  if not exists(select 1 from public.event_ropings where event_id=e and division_id=d and classification_id=c) then raise exception 'Event creation did not preserve selected division'; end if;
  select * into strict h from public.roping_templates where producer_id=p and competition_format='handicap' and is_active limit 1;
  select id,division_id into strict hc,hd from public.classifications where producer_id=p and division_id<>h.division_id and is_active limit 1;
  update public.classifications set handicap_adjustment_seconds=-0.25 where id=hc;
  update public.roping_templates set available_division_ids=array[h.division_id,hd],handicap_rules=handicap_rules||jsonb_build_array(jsonb_build_object('classificationId',hc,'adjustmentSeconds',-0.25)) where id=h.id;
  r:=public.add_roping_to_event(e,h.id,hc,current_date,'fixed',now()::timestamp,'','Arena 1',h.main_round_count,false);
  if not exists(select 1 from public.event_ropings where id=r and division_id=hd and classification_id is null) then raise exception 'Handicap offering retained wrong division or member classification'; end if;
  if not exists(select 1 from public.event_roping_handicap_adjustments where event_roping_id=r and classification_id=hc)
    or exists(select 1 from public.event_roping_handicap_adjustments a join public.classifications cl on cl.id=a.classification_id where a.event_roping_id=r and cl.division_id<>hd) then raise exception 'Handicap rules crossed divisions'; end if;
  if public.event_roping_template_snapshot(r,true) is distinct from public.event_roping_template_snapshot(r,false) then raise exception 'Shared handicap snapshot differs'; end if;
  copied:=public.duplicate_division_template(p,h.id);
  if (select available_division_ids from public.roping_templates where id=copied)<>array[h.division_id,hd] then raise exception 'Handicap divisions not duplicated'; end if;
  rejected:=false;
  begin update public.roping_templates set handicap_rules='[]' where id=h.id;
  exception when others then rejected:=true; end;
  if not rejected then raise exception 'Missing per-division handicap rules accepted'; end if;
  e:=public.create_roping_with_competition_formats(p,'Shared handicap creation','shared-handicap-'||gen_random_uuid(),'','',now()::timestamp,(now()+interval '1 day')::timestamp,null,null,false,
    jsonb_build_array(jsonb_build_object('templateId',h.id,'classificationId','','competitionFormat','handicap','scheduledDate',current_date,'scheduleType','fixed','startsAt',now()::timestamp,'roundCount',h.main_round_count,'incentiveEnabled',true,'incentiveRules',jsonb_build_array(jsonb_build_object('classificationId',hc,'adjustmentSeconds',0.25)))),false,'[]',null,null);
  if not exists(select 1 from public.event_ropings where event_id=e and division_id=hd and classification_id is null and competition_format='handicap') then raise exception 'Shared handicap event creation failed'; end if;
end $$;
rollback;
select 'Shared template scenarios passed; all changes rolled back.' as result;
