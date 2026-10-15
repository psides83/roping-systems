begin;
do $$
declare src public.event_ropings%rowtype; ecopy public.events%rowtype; e uuid:=gen_random_uuid(); r uuid:=gen_random_uuid(); p uuid; staff uuid; season uuid; slug text; q uuid; other_q uuid;
begin
 select er.* into strict src from public.event_ropings er where exists(select 1 from public.producer_staff st where st.producer_id=er.producer_id and st.role='owner') and exists(select 1 from public.producer_seasons s where s.producer_id=er.producer_id) limit 1;
 p:=src.producer_id;select user_id into strict staff from public.producer_staff where producer_id=p and role='owner' limit 1;
 perform set_config('request.jwt.claim.sub',staff::text,true);
 select id into strict season from public.producer_seasons where producer_id=p limit 1;
 select pr.slug into slug from public.producers pr where id=p;
 select * into strict ecopy from public.events where id=src.event_id;
 insert into public.events select (jsonb_populate_record(null::public.events,to_jsonb(ecopy)||jsonb_build_object('id',e,'slug','schedule-qualification-'||e::text,'status','scheduled','publication_state','draft','qualification_rule_set_id',null))).*;
 insert into public.event_ropings select (jsonb_populate_record(null::public.event_ropings,to_jsonb(src)||jsonb_build_object('id',r,'event_id',e,'event_day_status','scheduled','qualification_override','inherit','qualification_rule_set_id',null))).*;
 insert into public.qualification_rule_sets(producer_id,season_id,name,is_finals,minimum_ropings,earned_position_policy,bonus_entries_enabled) values(p,season,'Schedule test '||e::text,false,10,'rank',true) returning id into q;
 insert into public.qualification_rule_sets(producer_id,season_id,name,is_finals,minimum_ropings) values(p,season,'Override test '||e::text,true,7) returning id into other_q;
 perform public.save_qualification_assignment(e,null,'custom',q);
 if exists(select 1 from public.public_event_qualification_requirements(slug,e)) then raise exception 'Hidden event requirements leaked';end if;
 update public.events set publication_state='published' where id=e;
 if not exists(select 1 from public.public_event_qualification_requirements(slug,e) x where x.event_roping_id=r and x.minimum_ropings=10 and x.earned_position_policy='rank' and x.bonus_entries_enabled) then raise exception 'Inherited ordinary rule was not published fully';end if;
 if exists(select 1 from public.public_event_qualification_requirements('unknown-producer-'||e::text,e)) then raise exception 'Producer scope failed';end if;
 perform public.save_qualification_assignment(e,r,'custom',other_q);
 if not exists(select 1 from public.public_event_qualification_requirements(slug,e) x where x.event_roping_id=r and x.minimum_ropings=7) then raise exception 'Custom roping override not published';end if;
 perform public.save_qualification_assignment(e,r,'none',null);
 if exists(select 1 from public.public_event_qualification_requirements(slug,e)) then raise exception 'Opted-out roping published requirements';end if;
 perform public.save_qualification_assignment(e,r,'inherit',null);
 update public.events set status='cancelled' where id=e;
 if exists(select 1 from public.public_event_qualification_requirements(slug,e)) then raise exception 'Cancelled event leaked requirements';end if;
end $$;
rollback;
