create function public.my_roper_standings_context(target_membership_id uuid, target_season_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare member public.memberships%rowtype; producer public.producers%rowtype; season public.producer_seasons%rowtype;
begin
  select m.* into member from public.memberships m join public.ropers r on r.id=m.roper_id where m.id=target_membership_id and r.auth_user_id=auth.uid();
  if member.id is null then raise exception 'This membership is not linked to your account'; end if;
  select * into producer from public.producers where id=member.producer_id;
  select * into season from public.producer_seasons where producer_id=producer.id and (target_season_id is null or id=target_season_id)
    order by ((now() at time zone producer.timezone)::date between starts_on and ends_on) desc, starts_on desc,id limit 1;
  if target_season_id is not null and season.id is null then raise exception 'Choose a season belonging to this producer'; end if;
  return jsonb_build_object('roperId',member.roper_id,'producerSlug',producer.slug,
    'season',case when season.id is not null then jsonb_build_object('id',season.id,'name',season.name,'startsOn',season.starts_on,'endsOn',season.ends_on) else null end,
    'seasons',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name) order by s.starts_on desc,s.id),'[]'::jsonb) from public.producer_seasons s where s.producer_id=producer.id),
    'currentClasses',(select coalesce(jsonb_agg(distinct case when c.standalone_enabled then c.id::text else c.division_id::text||':handicap' end),'[]'::jsonb)
      from public.membership_classification_history h join public.classifications c on c.id=h.classification_id
      where h.membership_id=member.id and h.producer_id=producer.id and h.effective_on<=(now() at time zone producer.timezone)::date
        and (h.ended_on is null or h.ended_on>(now() at time zone producer.timezone)::date)),
    'requirements',(select coalesce(jsonb_agg(jsonb_build_object('classId',q.class_key,'topPlaces',q.top_places,'minimumRopings',q.minimum_ropings,'cutoffOn',q.cutoff_on)),'[]'::jsonb)
      from public.standings_qualification_rules q where q.producer_id=producer.id and q.season_id=season.id)
  );
end;
$$;
revoke all on function public.my_roper_standings_context(uuid,uuid) from public,anon;
grant execute on function public.my_roper_standings_context(uuid,uuid) to authenticated;
