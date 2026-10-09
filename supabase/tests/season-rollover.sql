-- All season setup, dues and rules in this test are rolled back.
begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text
  from public.producer_staff where role='owner' order by created_at,user_id limit 1),true);
set local role authenticated;
do $$
declare producer uuid; source public.producer_seasons; first_id uuid:=gen_random_uuid(); next_id uuid:=gen_random_uuid();
  before_ledger bigint; before_dues bigint; active_count integer; member uuid; account uuid; result uuid;
  disabled_id uuid:=gen_random_uuid(); failed_id uuid:=gen_random_uuid();
begin
  select id into producer from public.producers where public.can_administer_organization(id) order by id limit 1;
  select * into source from public.producer_seasons where producer_id=producer order by ends_on desc limit 1;
  if source.id is null then raise exception 'Owner season fixture required'; end if;
  select count(*) into before_ledger from public.fund_transactions where producer_id=producer;
  select count(*) into before_dues from public.membership_dues where producer_id=producer;
  select count(*) into active_count from public.memberships where producer_id=producer and status='active';
  result:=public.rollover_producer_season(producer,first_id,source.id,'Rollover transaction test',source.ends_on+1,source.ends_on+365,
    true,10000,true,'fixed',0,null,true,true);
  if result<>first_id then raise exception 'Wrong season returned'; end if;
  perform public.rollover_producer_season(producer,first_id,source.id,'Rollover transaction test',source.ends_on+1,source.ends_on+365,
    true,10000,true,'fixed',0,null,true,true);
  if (select count(*) from public.membership_dues where season_id=first_id)<>active_count then raise exception 'Incorrect bulk assessment or duplicate retry'; end if;
  if (select count(*) from public.membership_dues where producer_id=producer)<>before_dues+active_count then raise exception 'Old dues changed'; end if;
  if (select count(*) from public.fund_transactions where producer_id=producer)<>before_ledger then raise exception 'Rollover created fake fund transactions'; end if;
  if exists(select 1 from public.qualification_rule_sets where season_id=first_id and (cutoff_on is not null or attendance_cutoff_on is not null)) then raise exception 'Old cutoffs leaked'; end if;
  if (select count(*) from public.qualification_rule_sets where season_id=first_id)<>(select count(*) from public.qualification_rule_sets where season_id=source.id) then raise exception 'Qualification templates missing'; end if;
  if exists(select 1 from public.manual_finals_positions where season_id=first_id) then raise exception 'Prior awards copied'; end if;
  begin
    perform public.rollover_producer_season(producer,first_id,source.id,'Different request',source.ends_on+1,source.ends_on+365,true,10000,true,'fixed',0,null,true,true);
    raise exception 'Mismatched retry accepted';
  exception when raise_exception then if sqlerrm='Mismatched retry accepted' then raise; end if; end;
  perform public.rollover_producer_season(producer,next_id,first_id,'Assessment settings test',source.ends_on+366,source.ends_on+730,
    true,12500,true,'fixed',0,null,false,false);
  select id into member from public.memberships where producer_id=producer order by id limit 1;
  if member is not null then
    account:=public.assess_membership_dues(producer,member,next_id,null);
    if (select amount_cents from public.membership_dues where id=account)<>12500 then raise exception 'Assessment did not use seasonal settings'; end if;
  end if;
  perform public.save_season_dues_settings(producer,next_id,1,15000,false,'fixed',0,null);
  if account is not null and (select amount_cents from public.membership_dues where id=account)<>12500 then raise exception 'Existing charges were changed'; end if;
  begin
    perform public.save_season_dues_settings(producer,next_id,1,17500,false,'fixed',0,null);
    raise exception 'Stale dues settings accepted';
  exception when raise_exception then if sqlerrm='Stale dues settings accepted' then raise; end if; end;
  perform public.rollover_producer_season(producer,disabled_id,next_id,'No dues test',source.ends_on+731,source.ends_on+1095,
    false,0,false,'fixed',0,null,false,false);
  if member is not null then
    begin
      perform public.assess_membership_dues(producer,member,disabled_id,null);
      raise exception 'Disabled seasonal dues assessed';
    exception when raise_exception then if sqlerrm='Disabled seasonal dues assessed' then raise; end if; end;
  end if;
  begin
    perform public.rollover_producer_season(producer,failed_id,disabled_id,'Atomic failure test',source.ends_on+1096,source.ends_on+1460,
      true,100,false,'fixed',200,null,true,false);
    raise exception 'Invalid contribution accepted';
  exception when raise_exception then if sqlerrm='Invalid contribution accepted' then raise; end if; end;
  if exists(select 1 from public.producer_seasons where id=failed_id) then raise exception 'Failed rollover left partial records'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
  begin
    perform public.rollover_producer_season(producer,gen_random_uuid(),source.id,'Unauthorized',source.ends_on+731,source.ends_on+1095,false,0,false,'fixed',0,null,false,false);
    raise exception 'Unauthorized rollover accepted';
  exception when raise_exception then if sqlerrm='Unauthorized rollover accepted' then raise; end if; end;
end $$;
reset role;
rollback;
