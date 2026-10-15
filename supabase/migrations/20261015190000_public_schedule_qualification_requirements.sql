create function public.public_event_qualification_requirements(target_producer_slug text,target_event_id uuid default null)
returns table(event_roping_id uuid,season_name text,season_ends_on date,rule_name text,top_places integer,minimum_ropings integer,
  cutoff_on date,attendance_cutoff_on date,requirements_available boolean,requirement_match text,earned_position_policy text,bonus_entries_enabled boolean)
language sql stable security definer set search_path='' as $$
  select r.id,s.name,s.ends_on,q.name,q.top_places,q.minimum_ropings,q.cutoff_on,q.attendance_cutoff_on,
    q.id is not null and (q.class_key is null or q.class_key=case when r.competition_format in ('handicap','four_d') then r.division_id::text||':'||r.competition_format else r.classification_id::text end),
    q.requirement_match,q.earned_position_policy,q.bonus_entries_enabled
  from public.event_ropings r join public.events e on e.id=r.event_id and e.producer_id=r.producer_id
  join public.producers p on p.id=r.producer_id
  left join public.qualification_rule_sets q on q.id=public.effective_qualification_rule_set(r.id) and q.producer_id=r.producer_id
  left join public.roping_qualification_checks c on c.event_roping_id=r.id and c.producer_id=r.producer_id
  join public.producer_seasons s on s.id=coalesce(q.season_id,c.season_id) and s.producer_id=r.producer_id
  where r.qualification_override<>'none' and (q.id is not null or c.event_roping_id is not null)
    and p.slug=target_producer_slug and e.publication_state='published' and e.status<>'cancelled'
    and (target_event_id is null or e.id=target_event_id);
$$;
revoke all on function public.public_event_qualification_requirements(text,uuid) from public;
grant execute on function public.public_event_qualification_requirements(text,uuid) to anon,authenticated;
