create function public.walk_up_age_requirements(target_event uuid)
returns table(roping_id uuid, age_required boolean, male_age_required boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_enter_event(target_event) then raise exception 'Entry access is required'; end if;
  return query select r.id,
    coalesce(c.eligibility_type='age' and r.competition_format<>'handicap',false),
    d.gender_policy='women_only' and case when r.male_eligibility_policy='producer_default'
      then d.male_youth_maximum_age is not null or d.male_senior_minimum_age is not null
      else r.male_eligibility_policy in ('age','age_and_classification','age_or_classification') end
    from public.event_ropings r join public.divisions d on d.id=r.division_id
    left join public.classifications c on c.id=r.classification_id where r.event_id=target_event;
end;
$$;
revoke all on function public.walk_up_age_requirements(uuid) from public,anon;
grant execute on function public.walk_up_age_requirements(uuid) to authenticated;
