begin;
do $$
declare owner_id uuid; fixture record; future record; copied uuid; created uuid; source jsonb; item jsonb; entries integer;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select r.*,p.slug as producer_slug,s.id as season_id into strict fixture
    from public.event_ropings r join public.producers p on p.id=r.producer_id
    join public.events e on e.id=r.event_id join public.producer_seasons s on s.producer_id=r.producer_id
    and r.scheduled_date between s.starts_on and s.ends_on
    where r.result_status='official' and e.is_public and e.status<>'cancelled'
    and not exists(select 1 from public.payout_receipt_awards a join public.payout_receipts receipt on receipt.id=a.receipt_id where a.event_roping_id=r.id and receipt.reversed_at is null)
    and exists(select 1 from public.roping_entries x where x.event_roping_id=r.id and x.competition_status='active' group by x.roper_id having count(*)>1) limit 1;
  if fixture.payouts_finalized_at is not null then perform public.finalize_roping_payouts(fixture.id,true,'Rollback-only attendance test'); end if;
  update public.event_ropings set attendance_count_mode='per_entry' where id=fixture.id;
  source:=public.public_season_standings_source(fixture.producer_slug,fixture.season_id);
  for item in select value from jsonb_array_elements(source->'contributions') where value->>'ropingId'=fixture.id::text loop
    select count(*) into entries from public.roping_entries where event_roping_id=fixture.id and roper_id=(item->>'roperId')::uuid and competition_status='active';
    if (item->>'attendanceCount')::integer<>entries then raise exception 'Per-entry attendance mismatch'; end if;
  end loop;
  update public.event_ropings set attendance_count_mode='once_per_roping' where id=fixture.id;
  source:=public.public_season_standings_source(fixture.producer_slug,fixture.season_id);
  if exists(select 1 from jsonb_array_elements(source->'contributions') where value->>'ropingId'=fixture.id::text and (value->>'attendanceCount')::integer<>1) then raise exception 'Once-per-roping attendance mismatch'; end if;

  select r.* into strict future from public.event_ropings r join public.events e on e.id=r.event_id
    join public.roping_templates t on t.id=r.roping_template_id
    where r.producer_id=fixture.producer_id and r.event_day_status not in ('in_progress','completed')
    and e.status not in ('completed','cancelled') and t.is_active and t.competition_format='standard' limit 1;
  update public.roping_templates set attendance_count_mode='per_entry' where id=future.roping_template_id;
  copied:=public.duplicate_division_template(future.producer_id,future.roping_template_id);
  if (select attendance_count_mode from public.roping_templates where id=copied)<>'per_entry' then raise exception 'Template duplication lost attendance mode'; end if;
  created:=public.add_roping_to_event(future.event_id,copied,future.classification_id,future.scheduled_date,'fixed',future.scheduled_date+time '09:00',null,future.arena_name,null,false);
  if (select attendance_count_mode from public.event_ropings where id=created)<>'per_entry' then raise exception 'Roping creation lost attendance mode'; end if;
  if public.event_roping_template_snapshot(created,false)->'format'->>'attendance_count_mode'<>'per_entry' then raise exception 'Template review omitted attendance mode'; end if;
end;
$$;
rollback;
