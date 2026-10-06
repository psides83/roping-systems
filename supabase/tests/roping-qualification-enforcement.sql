begin;
select set_config('request.jwt.claim.sub','2d940f25-84d8-4eb1-a260-2bb76717cfda',true);
do $$
declare
  roping public.event_ropings%rowtype;
  season public.producer_seasons%rowtype;
  rule public.standings_qualification_rules%rowtype;
  revision bigint;
  qualified uuid;
  unqualified uuid;
  entry_id uuid;
  qualified_entry_id uuid;
  source_roping_id uuid;
  transfer_entry_id uuid;
begin
  select r.* into strict roping from public.event_ropings r
  join public.classifications c on c.id=r.classification_id
  where r.event_id='0405a4f6-bdf6-49d6-af75-7f665006308b' and c.rank>0
    and not exists(select 1 from public.roping_entries e where e.event_roping_id=r.id)
  order by c.rank desc limit 1;
  select * into strict season from public.producer_seasons where producer_id=roping.producer_id
  order by starts_on desc limit 1;
  select m.roper_id into strict qualified from public.memberships m
  join public.membership_classification_history h on h.membership_id=m.id
  where m.producer_id=roping.producer_id and h.classification_id=roping.classification_id and h.ended_on is null
  order by m.id limit 1;
  select m.roper_id into strict unqualified from public.memberships m
  join public.membership_classification_history h on h.membership_id=m.id
  where m.producer_id=roping.producer_id and h.classification_id=roping.classification_id and h.ended_on is null
    and m.roper_id<>qualified order by m.id limit 1;
  insert into public.standings_qualification_rules(producer_id,season_id,class_key,top_places,minimum_ropings)
  values(roping.producer_id,season.id,roping.classification_id::text,2,2)
  on conflict(season_id,class_key) do update set top_places=2,minimum_ropings=2
  returning * into rule;
  select standings_revision into revision from public.producers where id=roping.producer_id;
  perform public.save_roping_qualification_check(roping.id,season.id,roping.classification_id::text,revision,
    jsonb_build_array(jsonb_build_object('roperId',qualified,'rank',2,'ropingsEntered',2),
      jsonb_build_object('roperId',unqualified,'rank',3,'ropingsEntered',2)),rule.updated_at);
  if public.standings_qualification_failure(roping.id,qualified) is not null then raise exception 'Tied cutoff qualifier blocked'; end if;
  if public.standings_qualification_failure(roping.id,unqualified) is null then raise exception 'Unqualified contestant accepted'; end if;
  select public.create_event_entry_with_eligibility_override(roping.id,qualified,'office','unpaid',null) into entry_id;
  if entry_id is null then raise exception 'Qualified entry not created'; end if;
  qualified_entry_id := entry_id;
  if public.standings_qualification_failure(roping.id,qualified) is not null then
    raise exception 'Unstarted entry runs invalidated qualification';
  end if;
  begin
    perform public.create_event_entry_with_eligibility_override(roping.id,unqualified,'office','unpaid',null);
    raise exception 'Unqualified entry was created';
  exception when others then
    if sqlerrm='Unqualified entry was created' or sqlerrm not like '%top 2 standings%' then raise; end if;
  end;
  select public.create_event_entry_with_eligibility_override(roping.id,unqualified,'office','unpaid','Approved test qualification exception') into entry_id;
  if not exists(select 1 from public.roping_entries e where e.id=entry_id and e.eligibility_overridden
    and e.eligibility_override_reason='Approved test qualification exception' and e.eligibility_overridden_by=auth.uid()) then
    raise exception 'Staff override was not recorded';
  end if;
  select r.id into strict source_roping_id from public.event_ropings r
  join public.classifications c on c.id=r.classification_id
  where r.event_id=roping.event_id and r.division_id=roping.division_id and r.id<>roping.id
    and c.rank>0 and not exists(select 1 from public.roping_qualification_checks q where q.event_roping_id=r.id)
  order by c.rank desc limit 1;
  select public.create_event_entry_with_eligibility_override(source_roping_id,unqualified,'office','unpaid',null) into transfer_entry_id;
  begin
    perform public.transfer_event_entry_with_eligibility_override(transfer_entry_id,roping.id,'Test move to qualifying roping',null);
    raise exception 'Unqualified transfer accepted';
  exception when others then
    if sqlerrm='Unqualified transfer accepted' or sqlerrm not like '%top 2 standings%' then raise; end if;
  end;
  perform public.withdraw_event_entry(qualified_entry_id,'Test qualification reinstatement','keep_charges');
  update public.roping_qualification_checks set standings=jsonb_build_array(
    jsonb_build_object('roperId',qualified,'rank',3,'ropingsEntered',2)) where event_roping_id=roping.id;
  begin
    perform public.reinstate_event_entry(qualified_entry_id,'Test changed qualification');
    raise exception 'Unqualified reinstatement accepted';
  exception when others then
    if sqlerrm='Unqualified reinstatement accepted' or sqlerrm not like '%top 2 standings%' then raise; end if;
  end;
  update public.producers set standings_revision=standings_revision+1 where id=roping.producer_id;
  if public.standings_qualification_failure(roping.id,qualified) not like '%standings changed%' then
    raise exception 'Stale qualification accepted';
  end if;
end;
$$;
rollback;
