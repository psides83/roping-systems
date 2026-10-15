create or replace function public.save_finals_qualification_check(target_roping_id uuid,target_season_id uuid,
  target_class_key text,expected_revision bigint,target_standings jsonb,target_rule_updated_at timestamptz,target_bonus_entries_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
declare r public.event_ropings%rowtype; revision bigint;
begin
  select * into r from public.event_ropings where id=target_roping_id for update;
  if r.id is null or not public.can_manage_event_roping(r.id) then raise exception 'Roping management access is required'; end if;
  select standings_revision into revision from public.producers where id=r.producer_id for update;
  if target_season_id is not null and revision is distinct from expected_revision then raise exception 'Standings changed. Refresh and try again'; end if;
  -- Existing assignment trigger protects accepted entries and started competition.
  update public.event_ropings set qualification_override=case when target_season_id is null then 'none' else 'finals' end,
    qualification_rule_set_id=null where id=r.id;
  if exists(select 1 from public.roping_qualification_checks where event_roping_id=r.id and rule_set_id is not null) then
    delete from public.roping_qualification_checks where event_roping_id=r.id;
  end if;
  -- Assignment changes can advance the producer revision without changing the calculated rows.
  -- The caller's snapshot was verified under the producer lock before that change.
  select standings_revision into revision from public.producers where id=r.producer_id;
  perform public.save_roping_qualification_check_with_bonus(target_roping_id,target_season_id,target_class_key,
    revision,target_standings,target_rule_updated_at,target_bonus_entries_enabled);
end; $$;
revoke all on function public.save_finals_qualification_check(uuid,uuid,text,bigint,jsonb,timestamptz,boolean) from public,anon;
grant execute on function public.save_finals_qualification_check(uuid,uuid,text,bigint,jsonb,timestamptz,boolean) to authenticated;
