create or replace function public.standings_qualification_failure(target_roping_id uuid,target_roper_id uuid)
returns text language plpgsql security definer set search_path='' as $$
declare
  check_record public.roping_qualification_checks%rowtype;
  row jsonb;
  revision bigint;
begin
  select * into check_record from public.roping_qualification_checks where event_roping_id=target_roping_id;
  if check_record.event_roping_id is null then return null; end if;
  -- Serialize entry acceptance against a concurrent standings-changing transaction.
  select standings_revision into revision from public.producers where id=check_record.producer_id for share;
  if revision<>check_record.source_revision
    or not exists(select 1 from public.standings_qualification_rules r where r.season_id=check_record.season_id
      and r.class_key=check_record.class_key and r.updated_at=check_record.rule_updated_at) then
    return 'Qualification standings changed. Refresh this roping qualification check before accepting entries';
  end if;
  select item into row from jsonb_array_elements(check_record.standings) item where item->>'roperId'=target_roper_id::text;
  if row is null then return 'Contestant has no qualifying standings for this class and season'; end if;
  if check_record.top_places is not null and (row->>'rank')::integer>check_record.top_places then
    return format('This roping requires a top %s standings position (ties included)',check_record.top_places);
  end if;
  if (row->>'ropingsEntered')::integer<check_record.minimum_ropings then
    return format('This roping requires %s ropings entered in this class; contestant has %s',check_record.minimum_ropings,row->>'ropingsEntered');
  end if;
  return null;
end;
$$;
