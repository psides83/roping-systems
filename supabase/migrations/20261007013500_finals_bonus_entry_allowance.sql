alter table public.roping_qualification_checks add column bonus_entries_enabled boolean not null default false;

create function public.roping_entry_allowance(target_roping_id uuid,target_roper_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare normal integer; check_record public.roping_qualification_checks%rowtype; row jsonb;
begin
  select max_entries_per_roper into normal from public.event_ropings where id=target_roping_id;
  if normal is null then return null; end if;
  select * into check_record from public.roping_qualification_checks where event_roping_id=target_roping_id and bonus_entries_enabled;
  if check_record.event_roping_id is null or public.standings_qualification_failure(target_roping_id,target_roper_id) is not null then return normal; end if;
  select item into row from jsonb_array_elements(check_record.standings) item where item->>'roperId'=target_roper_id::text;
  return normal+greatest(coalesce((row->>'finalsPositions')::integer,0),0);
end;
$$;
revoke all on function public.roping_entry_allowance(uuid,uuid) from public,anon,authenticated;

create function public.save_roping_qualification_check_with_bonus(target_roping_id uuid,target_season_id uuid,
  target_class_key text,expected_revision bigint,target_standings jsonb,target_rule_updated_at timestamptz,target_bonus_entries_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare previous boolean; roping public.event_ropings%rowtype;
begin
  select * into roping from public.event_ropings where id=target_roping_id for update;
  if roping.id is null or not public.can_manage_event_roping(roping.id) then raise exception 'Roping management access is required'; end if;
  select bonus_entries_enabled into previous from public.roping_qualification_checks where event_roping_id=roping.id;
  if roping.event_day_status in ('in_progress','completed') and coalesce(previous,false) is distinct from coalesce(target_bonus_entries_enabled,false) then raise exception 'Bonus entry rules cannot change after the roping starts'; end if;
  perform public.save_roping_qualification_check(target_roping_id,target_season_id,target_class_key,expected_revision,target_standings,target_rule_updated_at);
  if target_season_id is not null then
    update public.roping_qualification_checks set bonus_entries_enabled=coalesce(target_bonus_entries_enabled,false) where event_roping_id=roping.id;
    if exists(select 1 from public.roping_entries e where e.event_roping_id=roping.id and e.competition_status='active' group by e.roper_id having count(*)>public.roping_entry_allowance(roping.id,e.roper_id)) then raise exception 'The new allowance is below an existing contestant entry count'; end if;
  end if;
end;
$$;
revoke all on function public.save_roping_qualification_check_with_bonus(uuid,uuid,text,bigint,jsonb,timestamptz,boolean) from public,anon;
grant execute on function public.save_roping_qualification_check_with_bonus(uuid,uuid,text,bigint,jsonb,timestamptz,boolean) to authenticated;

-- All three existing workflows use the same member-specific allowance.
do $$
declare definition text;
begin
  definition:=pg_get_functiondef('public.create_event_entry_with_eligibility_override(uuid,uuid,public.entry_source,public.payment_status,text)'::regprocedure);
  if position('existing_entry_count >= division_record.max_entries_per_roper' in definition)=0 then raise exception 'Unexpected entry-limit function'; end if;
  definition:=replace(definition,'division_record.max_entries_per_roper','public.roping_entry_allowance(division_record.id,target_person_id)');
  definition:=replace(definition,'existing_entry_count >= public.roping_entry_allowance','(select count(*) from public.roping_entries where event_roping_id=division_record.id and roper_id=target_person_id and competition_status=''active'') >= public.roping_entry_allowance');
  execute definition;
  definition:=pg_get_functiondef('public.transfer_event_entry(uuid,uuid,text)'::regprocedure);
  if position('destination_entry_count >= destination_division.max_entries_per_roper' in definition)=0 then raise exception 'Unexpected transfer-limit function'; end if;
  definition:=replace(definition,'destination_division.max_entries_per_roper','public.roping_entry_allowance(destination_division.id,entry_record.roper_id)');
  definition:=replace(definition,'destination_entry_count >= public.roping_entry_allowance','(select count(*) from public.roping_entries where event_roping_id=destination_division.id and roper_id=entry_record.roper_id and competition_status=''active'') >= public.roping_entry_allowance');
  execute definition;
  definition:=pg_get_functiondef('public.submit_online_entry_request(text,text,text,text,text,text,text,text,jsonb)'::regprocedure);
  if position('requested_quantity > division_record.max_entries_per_roper' in definition)=0 then raise exception 'Unexpected online entry-limit function'; end if;
  definition:=replace(definition,'division_record.max_entries_per_roper','public.roping_entry_allowance(division_record.id,selected_person_id)');
  definition:=replace(definition,'requested_quantity > public.roping_entry_allowance','requested_quantity+(select count(*) from public.roping_entries where event_roping_id=division_record.id and roper_id=selected_person_id and competition_status=''active'') > public.roping_entry_allowance');
  execute definition;
end;
$$;

create function public.enforce_roping_entry_allowance() returns trigger language plpgsql security definer set search_path='' as $$
declare allowance integer; count_active integer;
begin
  if new.competition_status<>'active' then return new; end if;
  if tg_op='UPDATE' and (new.event_roping_id,new.roper_id,new.competition_status) is not distinct from (old.event_roping_id,old.roper_id,old.competition_status) then return new; end if;
  perform 1 from public.event_ropings where id=new.event_roping_id for update;
  allowance:=public.roping_entry_allowance(new.event_roping_id,new.roper_id);
  if allowance is null then return new; end if;
  select count(*) into count_active from public.roping_entries where event_roping_id=new.event_roping_id and roper_id=new.roper_id and competition_status='active' and id<>new.id;
  if count_active>=allowance then raise exception 'Contestant has reached the entry allowance (% regular and earned bonus entries combined)',allowance; end if;
  return new;
end;
$$;
create trigger z_enforce_roping_entry_allowance before insert or update of event_roping_id,roper_id,competition_status on public.roping_entries for each row execute function public.enforce_roping_entry_allowance();

create function public.online_finals_entry_allowances(target_producer_slug text,target_event_slug text,target_member_number text,target_email text)
returns table(event_roping_id uuid,normal_entries integer,bonus_entries integer,remaining_entries integer)
language sql stable security definer set search_path='' as $$
  with member as (
    select m.* from public.memberships m join public.producers p on p.id=m.producer_id join public.ropers r on r.id=m.roper_id
    where p.slug=target_producer_slug and m.status='active' and lower(m.member_number)=lower(trim(target_member_number)) and lower(r.email)=lower(trim(target_email))
  )
  select r.id,r.max_entries_per_roper,
    case when r.max_entries_per_roper is null then 0 else greatest(public.roping_entry_allowance(r.id,m.roper_id)-r.max_entries_per_roper,0) end,
    case when r.max_entries_per_roper is null then null else greatest(public.roping_entry_allowance(r.id,m.roper_id)-(select count(*)::integer from public.roping_entries x where x.event_roping_id=r.id and x.roper_id=m.roper_id and x.competition_status='active'),0) end
  from member m join public.events e on e.producer_id=m.producer_id and e.slug=target_event_slug and e.publication_state='published' and e.is_public
  join public.event_ropings r on r.event_id=e.id join public.roping_qualification_checks q on q.event_roping_id=r.id and q.bonus_entries_enabled;
$$;
revoke all on function public.online_finals_entry_allowances(text,text,text,text) from public;
grant execute on function public.online_finals_entry_allowances(text,text,text,text) to anon,authenticated;
