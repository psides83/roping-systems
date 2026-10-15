begin;
do $$
declare p uuid; season uuid; current_rule uuid; candidate uuid; rejected boolean;
begin
 select s.producer_id,s.id into strict p,season from public.producer_seasons s limit 1;
 select id into current_rule from public.qualification_rule_sets where producer_id=p and is_finals;
 if current_rule is null then
  insert into public.qualification_rule_sets(producer_id,season_id,name,is_finals) values(p,season,'Current finals test '||gen_random_uuid()::text,true) returning id into current_rule;
 end if;
 insert into public.qualification_rule_sets(producer_id,season_id,name,is_finals) values(p,season,'Candidate test '||gen_random_uuid()::text,false) returning id into candidate;
 rejected:=false;
 begin update public.qualification_rule_sets set is_finals=true where id=candidate; exception when unique_violation then rejected:=true;end;
 if not rejected then raise exception 'Second finals designation accepted';end if;
 rejected:=false;
 begin insert into public.qualification_rule_sets(producer_id,season_id,name,is_finals) values(p,season,'Duplicate finals test '||gen_random_uuid()::text,true);exception when unique_violation then rejected:=true;end;
 if not rejected then raise exception 'Duplicate finals insert accepted';end if;
 rejected:=false;
 begin update public.qualification_rule_sets set season_id=null where id=current_rule;exception when not_null_violation or raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Finals rule without season accepted';end if;
 if (select count(*) from public.qualification_rule_sets where producer_id=p and is_finals)<>1 then raise exception 'Failed saves changed current designation';end if;
 update public.qualification_rule_sets set is_finals=false where id=current_rule;
 update public.qualification_rule_sets set is_finals=true where id=candidate;
 if not exists(select 1 from public.qualification_rule_sets where id=candidate and is_finals and season_id=season) then raise exception 'Explicit finals replacement failed';end if;
end $$;
rollback;
