-- Reject decisions submitted from a stale review screen after results change.
create or replace function public.validate_finals_staff_decision() returns trigger language plpgsql security definer set search_path='' as $$
declare rule public.finals_qualification_rules%rowtype; source jsonb; slug text; finish jsonb; rank integer; expected jsonb; group_size integer;
begin
  select * into rule from public.finals_qualification_rules where id=new.rule_id and producer_id=new.producer_id and enabled;
  if rule.id is null then raise exception 'Choose an active qualifier belonging to this producer'; end if;
  select p.slug into slug from public.producers p where p.id=new.producer_id for update;
  if not exists(select 1 from jsonb_array_elements(rule.places) place where (place->>'place')::integer=new.place) then raise exception 'Choose a configured qualifying place'; end if;
  if cardinality(new.entry_ids)<>(select count(distinct id) from unnest(new.entry_ids) id) then raise exception 'Choose distinct entries'; end if;
  source:=public.finals_qualification_source(slug,rule.season_id);
  select item into finish from jsonb_array_elements(source->'finishes') item
    where item->>'ropingId'=rule.event_roping_id::text and item->>'stage'=rule.stage
      and (rule.stage<>'go_round' or (item->>'round')::integer=rule.round_number)
      and item->>'entryId'=new.entry_ids[1]::text;
  if finish is null then raise exception 'This entry no longer has an official qualifying finish'; end if;
  rank:=(finish->>'place')::integer;
  if rank<>new.place and (rule.repeat_policy<>'pass_down' or rank<new.place) then raise exception 'This entry does not match the qualifying place'; end if;
  select jsonb_agg(jsonb_build_array(item->>'entryId',item->>'memberId',(item->>'place')::integer) order by item->>'entryId'),count(*) into expected,group_size
    from jsonb_array_elements(source->'finishes') item where item->>'ropingId'=rule.event_roping_id::text and item->>'stage'=rule.stage
    and (rule.stage<>'go_round' or (item->>'round')::integer=rule.round_number) and (item->>'place')::integer=rank;
  if new.context is distinct from expected then raise exception 'The official finish group changed. Refresh before deciding'; end if;
  if exists(select 1 from unnest(new.entry_ids) id where not exists(select 1 from jsonb_array_elements(expected) item where item->>0=id::text and item->>1 is not null)) then raise exception 'Choose member entries in the current finish group'; end if;
  if new.kind='tie' and (rule.tie_policy<>'staff_decision' or group_size<2) then raise exception 'This placing does not require a staff tie decision'; end if;
  if new.kind='revoke' and cardinality(new.entry_ids)<>1 then raise exception 'Revoke one award at a time'; end if;
  new.created_at:=clock_timestamp();
  return new;
end;
$$;
