create table public.season_dues_settings (
  id uuid primary key references public.producer_seasons(id),
  producer_id uuid not null references public.producers(id),
  enabled boolean not null,
  amount_cents bigint not null check(amount_cents between 0 and 2147483647),
  installments boolean not null,
  allocation_mode text not null check(allocation_mode in ('fixed','percent')),
  allocation_value bigint not null check(allocation_value>=0),
  fund_id uuid,
  revision integer not null default 1,
  foreign key(id,producer_id) references public.producer_seasons(id,producer_id),
  foreign key(fund_id,producer_id) references public.producer_funds(id,producer_id),
  check(not enabled or amount_cents>0),
  check((allocation_mode='fixed' and allocation_value<=amount_cents) or (allocation_mode='percent' and allocation_value<=10000)),
  check(allocation_value=0 or fund_id is not null)
);
create table public.season_rollovers (
  id uuid primary key references public.producer_seasons(id),
  producer_id uuid not null references public.producers(id),
  source_season_id uuid not null,
  request jsonb not null,
  fund_balances jsonb not null,
  assessed_members integer not null,
  copied_qualifications integer not null,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id),
  foreign key(id,producer_id) references public.producer_seasons(id,producer_id),
  foreign key(source_season_id,producer_id) references public.producer_seasons(id,producer_id)
);
do $$ declare t text; begin
  foreach t in array array['season_dues_settings','season_rollovers'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy "Staff read season setup" on public.%I for select to authenticated using(public.has_organization_access(producer_id))',t);
    execute format('create trigger audit_%I after insert or update or delete on public.%I for each row execute function public.write_audit_log()',t,t);
  end loop;
end $$;

create function public.rollover_producer_season(target_producer uuid,reference uuid,source_season uuid,
  season_name text,starts_on date,ends_on date,dues_enabled boolean,dues_amount bigint,allow_installments boolean,
  allocation_mode text,allocation_value bigint,target_fund uuid,assess_members boolean,copy_qualifications boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare source public.producer_seasons; existing public.season_rollovers; request_data jsonb; balances jsonb;
  member_count integer:=0; qualification_count integer:=0; contribution bigint;
begin
  if not public.can_administer_organization(target_producer) then raise exception 'Owner or administrator access is required'; end if;
  perform 1 from public.producers where id=target_producer for update;
  request_data:=jsonb_build_object('source',source_season,'name',trim(season_name),'starts',starts_on,'ends',ends_on,
    'duesEnabled',dues_enabled,'amount',dues_amount,'installments',allow_installments,'mode',allocation_mode,
    'allocation',allocation_value,'fund',target_fund,'assess',assess_members,'copy',copy_qualifications);
  select * into existing from public.season_rollovers where id=reference;
  if found then
    if existing.producer_id=target_producer and existing.request=request_data then return reference; end if;
    raise exception 'This rollover reference has already been used';
  end if;
  select * into source from public.producer_seasons where id=source_season and producer_id=target_producer for share;
  if source.id is null or starts_on is null or ends_on is null or starts_on<=source.ends_on or ends_on<starts_on then raise exception 'Choose a new season after the source season'; end if;
  if reference is null or dues_enabled is null or assess_members is null or copy_qualifications is null or allow_installments is null then raise exception 'Complete the season setup'; end if;
  if not dues_enabled and assess_members then raise exception 'Set up dues before assessing members'; end if;
  if dues_enabled and allocation_value>0 and not exists(select 1 from public.producer_funds where id=target_fund and producer_id=target_producer and is_active) then raise exception 'Choose an active producer fund'; end if;
  -- Preserve the source season's defaults before creating new defaults. No paid records change.
  insert into public.season_dues_settings(id,producer_id,enabled,amount_cents,installments,allocation_mode,allocation_value,fund_id)
    select source.id,target_producer,true,amount_cents,installments,s.allocation_mode,s.allocation_value,fund_id
    from public.producer_dues_settings s where s.producer_id=target_producer on conflict(id) do nothing;
  insert into public.producer_seasons(id,producer_id,name,starts_on,ends_on) values(reference,target_producer,trim(season_name),starts_on,ends_on);
  insert into public.season_dues_settings(id,producer_id,enabled,amount_cents,installments,allocation_mode,allocation_value,fund_id)
    values(reference,target_producer,dues_enabled,case when dues_enabled then dues_amount else 0 end,allow_installments,
      allocation_mode,case when dues_enabled then allocation_value else 0 end,case when dues_enabled and allocation_value>0 then target_fund end);
  if assess_members then
    contribution:=case when allocation_mode='fixed' then allocation_value else round(dues_amount::numeric*allocation_value/10000)::bigint end;
    insert into public.membership_dues(producer_id,membership_id,season_id,amount_cents,installments,allocation_cents,fund_id)
      select target_producer,m.id,reference,dues_amount,allow_installments,contribution,case when contribution>0 then target_fund end
      from public.memberships m where m.producer_id=target_producer and m.status='active';
    get diagnostics member_count=row_count;
  end if;
  if copy_qualifications then
    insert into public.qualification_rule_sets(producer_id,name,season_id,top_places,minimum_ropings,cutoff_on,attendance_cutoff_on,
      requirement_match,earned_position_policy,bonus_entries_enabled)
      select target_producer,left(q.name,50)||' / '||left(trim(season_name),35)||' '||left(reference::text,8),reference,
        q.top_places,q.minimum_ropings,null,null,q.requirement_match,q.earned_position_policy,q.bonus_entries_enabled
      from public.qualification_rule_sets q where q.producer_id=target_producer and q.season_id=source.id;
    get diagnostics qualification_count=row_count;
  end if;
  -- Snapshot for review, not a deposit: existing fund accounts and reservations are unchanged.
  perform 1 from public.producer_funds where producer_id=target_producer order by id for update;
  select coalesce(jsonb_agg(to_jsonb(f)),'[]'::jsonb) into balances from public.producer_fund_availability(target_producer) f;
  insert into public.season_rollovers(id,producer_id,source_season_id,request,fund_balances,assessed_members,copied_qualifications,created_by)
    values(reference,target_producer,source.id,request_data,balances,member_count,qualification_count,auth.uid());
  return reference;
end $$;

-- All future assessments use a season's own configuration when one has been established.
do $$ declare definition text; begin
  select pg_get_functiondef('public.assess_membership_dues(uuid,uuid,uuid,uuid)'::regprocedure) into definition;
  definition:=replace(definition,
    'select * into settings from public.producer_dues_settings where producer_id=target_producer;',
    'if exists(select 1 from public.season_dues_settings where id=target_season and producer_id=target_producer) then
      if exists(select 1 from public.season_dues_settings where id=target_season and producer_id=target_producer and not enabled) then raise exception ''Membership dues are not enabled for this season''; end if;
      select s.id,s.producer_id,s.amount_cents,s.installments,s.allocation_mode,s.allocation_value,s.fund_id,s.revision into settings
        from public.season_dues_settings s where s.id=target_season and s.producer_id=target_producer;
    else select * into settings from public.producer_dues_settings where producer_id=target_producer; end if;');
  execute definition;
end $$;
create function public.save_season_dues_settings(target_producer uuid,target_season uuid,expected_revision integer,
  amount bigint,allow_installments boolean,mode text,allocation bigint,target_fund uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare rev integer;
begin
  if not public.can_administer_organization(target_producer) then raise exception 'Administrator access is required'; end if;
  perform 1 from public.producers where id=target_producer for update;
  if not exists(select 1 from public.producer_seasons where id=target_season and producer_id=target_producer) then raise exception 'Choose a producer season'; end if;
  select revision into rev from public.season_dues_settings where id=target_season;
  if expected_revision is distinct from coalesce(rev,0) then raise exception 'Season dues changed. Reload before saving'; end if;
  if amount is null or amount<=0 then raise exception 'Enter positive seasonal dues'; end if;
  if allocation>0 and not exists(select 1 from public.producer_funds where id=target_fund and producer_id=target_producer and is_active) then raise exception 'Choose an active producer fund'; end if;
  insert into public.season_dues_settings(id,producer_id,enabled,amount_cents,installments,allocation_mode,allocation_value,fund_id)
    values(target_season,target_producer,true,amount,allow_installments,mode,allocation,case when allocation>0 then target_fund end)
    on conflict(id) do update set enabled=true,amount_cents=excluded.amount_cents,installments=excluded.installments,
      allocation_mode=excluded.allocation_mode,allocation_value=excluded.allocation_value,fund_id=excluded.fund_id,revision=season_dues_settings.revision+1
    returning revision into rev;
  return rev;
end $$;
revoke all on function public.save_season_dues_settings(uuid,uuid,integer,bigint,boolean,text,bigint,uuid) from public,anon;
grant execute on function public.save_season_dues_settings(uuid,uuid,integer,bigint,boolean,text,bigint,uuid) to authenticated;
revoke all on function public.rollover_producer_season(uuid,uuid,uuid,text,date,date,boolean,bigint,boolean,text,bigint,uuid,boolean,boolean) from public,anon;
grant execute on function public.rollover_producer_season(uuid,uuid,uuid,text,date,date,boolean,bigint,boolean,text,bigint,uuid,boolean,boolean) to authenticated;
notify pgrst,'reload schema';
