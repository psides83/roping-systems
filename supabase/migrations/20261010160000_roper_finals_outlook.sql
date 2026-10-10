-- Read-only outlook context, available only for an account's linked membership.
create function public.my_roper_finals_outlook_context(target_membership_id uuid, target_season_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare member public.memberships%rowtype; producer public.producers%rowtype; context jsonb;
  selected_season uuid; today date; r record; candidate public.roping_entries%rowtype;
  restrictions jsonb; failure text; targets jsonb:='[]'::jsonb;
begin
  select m.* into member from public.memberships m join public.ropers p on p.id=m.roper_id
    where m.id=target_membership_id and p.auth_user_id=auth.uid();
  if member.id is null then raise exception 'This membership is not linked to your account'; end if;
  select * into producer from public.producers where id=member.producer_id;
  today:=(now() at time zone producer.timezone)::date;
  context:=public.my_roper_standings_context(member.id,target_season_id);
  selected_season:=(context->'season'->>'id')::uuid;
  for r in
    select er.*,e.title event_title,e.slug event_slug,d.name division_name,
      coalesce(q.id,c.rule_set_id) rule_id,
      case when q.id is not null then q.top_places else old_rule.top_places end top_places,
      case when q.id is not null then q.minimum_ropings else old_rule.minimum_ropings end minimum_ropings,
      coalesce(q.cutoff_on,old_rule.cutoff_on,s.ends_on) standings_cutoff,
      coalesce(q.attendance_cutoff_on,old_rule.attendance_cutoff_on,s.ends_on) attendance_cutoff,
      case when q.id is not null then q.requirement_match else 'all' end requirement_match,
      case when q.id is not null then q.earned_position_policy else old_rule.earned_position_policy end earned_policy,
      coalesce(q.bonus_entries_enabled,c.bonus_entries_enabled,false) bonus_enabled,
      q.id is not null or old_rule.class_key is not null requirements_available,
      case when er.competition_format in ('handicap','four_d') then er.division_id::text||':'||er.competition_format else er.classification_id::text end class_key
    from public.event_ropings er
    join public.events e on e.id=er.event_id and e.producer_id=er.producer_id
    join public.divisions d on d.id=er.division_id and d.producer_id=er.producer_id
    left join public.qualification_rule_sets q on q.id=public.effective_qualification_rule_set(er.id) and q.producer_id=er.producer_id
    left join public.roping_qualification_checks c on c.event_roping_id=er.id and c.producer_id=er.producer_id
    join public.producer_seasons s on s.id=coalesce(q.season_id,c.season_id) and s.producer_id=er.producer_id
    left join public.standings_qualification_rules old_rule on q.id is null and old_rule.producer_id=er.producer_id and old_rule.season_id=c.season_id and old_rule.class_key=c.class_key
    where er.producer_id=member.producer_id and s.id=selected_season
      and e.is_public and e.publication_state='published' and e.status not in ('cancelled','completed')
      and er.event_day_status not in ('in_progress','completed') and er.scheduled_date>=today
      and er.qualification_override<>'none' and (q.id is not null or c.event_roping_id is not null)
    order by er.scheduled_date,e.starts_at,er.sort_order,er.id
  loop
    candidate:=null;
    candidate.event_roping_id:=r.id; candidate.event_id:=r.event_id; candidate.producer_id:=member.producer_id;
    candidate.roper_id:=member.roper_id; candidate.membership_id:=case when member.status='active' then member.id else null end;
    if candidate.membership_id is not null and r.competition_format='handicap' then
      select a.classification_id into candidate.handicap_classification_id
        from public.event_roping_handicap_adjustments a join public.membership_classification_history h on h.classification_id=a.classification_id
        where a.event_roping_id=r.id and a.producer_id=member.producer_id and h.membership_id=member.id
          and h.effective_on<=r.scheduled_date and (h.ended_on is null or h.ended_on>=r.scheduled_date)
        order by h.effective_on desc,h.created_at desc limit 1;
    end if;
    restrictions:='[]'::jsonb;
    failure:=public.entry_classification_failure(candidate);
    if failure is not null then restrictions:=restrictions||jsonb_build_array(failure); end if;
    if public.member_fine_blocks(member.producer_id,member.roper_id,r.id,'entry')
      or public.member_fine_blocks(member.producer_id,member.roper_id,r.id,'competition') then
      restrictions:=restrictions||jsonb_build_array('An unpaid fine needs producer review before entry or competition.');
    end if;
    if public.membership_suspension_blocks(member.producer_id,member.roper_id,r.id) then
      restrictions:=restrictions||jsonb_build_array('A membership suspension affects this roping. Contact the producer.');
    end if;
    targets:=targets||jsonb_build_array(jsonb_build_object('id',r.id,'eventId',r.event_id,'eventTitle',r.event_title,
      'eventSlug',r.event_slug,'name',r.name,'divisionName',r.division_name,'date',r.scheduled_date,'classKey',r.class_key,
      'normalEntries',r.max_entries_per_roper,'bonusEnabled',r.bonus_enabled,'requirementsAvailable',r.requirements_available,
      'rule',jsonb_build_object('topPlaces',r.top_places,'minimumRopings',r.minimum_ropings,'standingsCutoff',r.standings_cutoff,
        'attendanceCutoff',r.attendance_cutoff,'earnedPositionPolicy',r.earned_policy,'requirementMatch',r.requirement_match),
      'restrictions',restrictions,'classificationAllowed',failure is null));
  end loop;
  return context||jsonb_build_object('today',today,'targets',targets);
end; $$;
revoke all on function public.my_roper_finals_outlook_context(uuid,uuid) from public,anon;
grant execute on function public.my_roper_finals_outlook_context(uuid,uuid) to authenticated;
