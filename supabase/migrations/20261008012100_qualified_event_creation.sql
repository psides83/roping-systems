create function public.create_event_with_qualification(target_producer_id uuid,event_setup jsonb,target_rule_set_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare event_id uuid;
begin
  if not public.can_manage_organization(target_producer_id) then raise exception 'Producer management access is required'; end if;
  if target_rule_set_id is not null and not exists(select 1 from public.qualification_rule_sets where id=target_rule_set_id and producer_id=target_producer_id) then raise exception 'Choose a rule set belonging to this producer'; end if;
  event_id:=public.create_roping_with_short_round_policy(
    target_organization_id=>target_producer_id,
    event_title=>event_setup->>'event_title',event_slug=>event_setup->>'event_slug',
    event_venue_name=>event_setup->>'event_venue_name',event_address=>event_setup->>'event_address',
    event_city=>event_setup->>'event_city',event_state=>event_setup->>'event_state',event_postal_code=>event_setup->>'event_postal_code',
    event_starts_at_local=>(event_setup->>'event_starts_at_local')::timestamp,
    event_ends_at_local=>(event_setup->>'event_ends_at_local')::timestamp,
    event_entries_open_at_local=>(event_setup->>'event_entries_open_at_local')::timestamp,
    event_entries_close_at_local=>(event_setup->>'event_entries_close_at_local')::timestamp,
    event_publication_state=>event_setup->>'event_publication_state',event_class_occurrences=>event_setup->'event_class_occurrences',
    event_short_round_enabled=>false,event_short_round_brackets=>'[]'::jsonb,event_short_round_tie_policy=>'advance_all'::public.short_round_tie_policy,
    event_fee_title=>event_setup->>'event_fee_title',event_fee_amount_cents=>(event_setup->>'event_fee_amount_cents')::integer
  );
  update public.events set qualification_rule_set_id=target_rule_set_id where id=event_id;
  perform public.set_event_arena_count(event_id,(event_setup->>'arena_count')::integer);
  return event_id;
end; $$;
revoke all on function public.create_event_with_qualification(uuid,jsonb,uuid) from public,anon;
grant execute on function public.create_event_with_qualification(uuid,jsonb,uuid) to authenticated;
