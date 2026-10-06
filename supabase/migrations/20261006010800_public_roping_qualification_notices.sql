-- Publish requirements only for ropings in an already-public event schedule.
create or replace function public.public_roping_qualification_notices(
  target_producer_slug text, target_event_id uuid default null
) returns table (
  event_roping_id uuid, season_name text, top_places integer,
  minimum_ropings integer, cutoff_on date, requirements_available boolean
) language sql stable security definer set search_path = public as $$
  select c.event_roping_id, s.name, q.top_places, q.minimum_ropings, q.cutoff_on,
    q.class_key is not null and c.class_key = case
      when r.competition_format in ('handicap','four_d') then r.division_id::text || ':' || r.competition_format
      else r.classification_id::text end
  from roping_qualification_checks c
  join event_ropings r on r.id=c.event_roping_id and r.producer_id=c.producer_id
  join producers p on p.id=c.producer_id
  join producer_seasons s on s.id=c.season_id and s.producer_id=c.producer_id
  left join standings_qualification_rules q on q.producer_id=c.producer_id
    and q.season_id=c.season_id and q.class_key=c.class_key
  where p.slug=target_producer_slug
    and (target_event_id is null or r.event_id=target_event_id)
    and exists (select 1 from public_event_schedule e where e.id=r.event_id);
$$;
revoke all on function public.public_roping_qualification_notices(text,uuid) from public;
grant execute on function public.public_roping_qualification_notices(text,uuid) to anon,authenticated;
