-- Finals use season/class requirements independently of non-finals event rule sets.
alter table public.event_ropings drop constraint event_ropings_qualification_override_check;
alter table public.event_ropings add constraint event_ropings_qualification_override_check
  check (qualification_override in ('inherit','none','custom','finals'));

create or replace function public.effective_qualification_rule_set(target_roping_id uuid) returns uuid
language sql stable security definer set search_path='' as $$
  select case r.qualification_override when 'none' then null when 'finals' then null
    when 'custom' then r.qualification_rule_set_id else e.qualification_rule_set_id end
  from public.event_ropings r join public.events e on e.id=r.event_id and e.producer_id=r.producer_id where r.id=target_roping_id;
$$;

create function public.save_finals_qualification_check(target_roping_id uuid,target_season_id uuid,
  target_class_key text,expected_revision bigint,target_standings jsonb,target_rule_updated_at timestamptz,target_bonus_entries_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r public.event_ropings%rowtype;
begin
  select * into r from public.event_ropings where id=target_roping_id for update;
  if r.id is null or not public.can_manage_event_roping(r.id) then raise exception 'Roping management access is required'; end if;
  -- Existing assignment trigger protects accepted entries and started competition.
  update public.event_ropings set qualification_override=case when target_season_id is null then 'none' else 'finals' end,
    qualification_rule_set_id=null where id=r.id;
  if exists(select 1 from public.roping_qualification_checks where event_roping_id=r.id and rule_set_id is not null) then
    delete from public.roping_qualification_checks where event_roping_id=r.id;
  end if;
  perform public.save_roping_qualification_check_with_bonus(target_roping_id,target_season_id,target_class_key,
    expected_revision,target_standings,target_rule_updated_at,target_bonus_entries_enabled);
end; $$;
revoke all on function public.save_finals_qualification_check(uuid,uuid,text,bigint,jsonb,timestamptz,boolean) from public,anon;
grant execute on function public.save_finals_qualification_check(uuid,uuid,text,bigint,jsonb,timestamptz,boolean) to authenticated;
