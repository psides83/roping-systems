-- A walk-up registration is one transaction, including optional pots.
create function public.create_walk_up_entries(
  target_event uuid, selections jsonb, target_roper uuid,
  guest_details jsonb, payment public.payment_status,
  waitlisted boolean, override_reason text
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  producer uuid;
  item jsonb;
  roping uuid;
  entry uuid;
  roper uuid := target_roper;
  options uuid[];
  option_id uuid;
  total integer := 0;
begin
  select producer_id into producer from public.events where id = target_event;
  if producer is null or not public.can_enter_event(target_event) then
    raise exception 'Entry access for this event is required';
  end if;
  if jsonb_typeof(selections) <> 'array' or jsonb_array_length(selections) not between 1 and 100 then
    raise exception 'Select at least one roping';
  end if;
  if roper is null then
    if public.requires_membership(producer) then raise exception 'Guest entries are not available when memberships are required'; end if;
    if guest_details is null or length(regexp_replace(coalesce(guest_details->>'phone',''), '[^0-9]', '', 'g')) <> 10 then
      raise exception 'Enter a 10-digit phone number';
    end if;
  elsif not exists(select 1 from public.memberships where producer_id = producer and roper_id = roper) then
    raise exception 'Choose a roper from this producer';
  end if;
  if (select count(distinct value->>'ropingId') from jsonb_array_elements(selections)) <> jsonb_array_length(selections) then
    raise exception 'Select each roping only once';
  end if;
  for item in select value from jsonb_array_elements(selections) loop
    roping := (item->>'ropingId')::uuid;
    if not exists(select 1 from public.event_ropings where id = roping and event_id = target_event
      and (target_roper is not null or allow_non_members)) then
      raise exception 'Choose an available roping from this event';
    end if;
    select coalesce(array_agg(value::uuid), '{}'::uuid[]) into options
      from jsonb_array_elements_text(item->'optionIds');
    if exists(select 1 from unnest(options) selected_id where not exists(
      select 1 from public.event_fees where id = selected_id and event_roping_id = roping and not is_required)) then
      raise exception 'An optional fee does not belong to the selected roping';
    end if;
    if waitlisted then
      perform public.join_roping_waitlist(roping, roper, case when roper is null then guest_details else null end, options, override_reason);
    else
      if roper is null then
        entry := public.create_guest_event_entry_v2_with_eligibility_override(roping,
          guest_details->>'firstName', guest_details->>'lastName', guest_details->>'email', guest_details->>'phone',
          nullif(guest_details->>'birthDate','')::date, (guest_details->>'competitionGender')::public.competition_gender, payment, override_reason);
        select roper_id into roper from public.roping_entries where id = entry;
      else
        entry := public.create_event_entry_with_eligibility_override(roping, roper, 'office', payment, override_reason);
      end if;
      foreach option_id in array options loop
        perform public.add_entry_option(entry, option_id);
      end loop;
    end if;
    total := total + 1;
  end loop;
  return total;
end;
$$;
revoke all on function public.create_walk_up_entries(uuid,jsonb,uuid,jsonb,public.payment_status,boolean,text) from public, anon;
grant execute on function public.create_walk_up_entries(uuid,jsonb,uuid,jsonb,public.payment_status,boolean,text) to authenticated;

create function public.walk_up_entry_eligibility(target_event uuid, target_roper uuid)
returns table(roping_id uuid, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
  producer uuid;
  member uuid;
  r public.event_ropings%rowtype;
  candidate public.roping_entries%rowtype;
  allowance integer;
begin
  select producer_id into producer from public.events where id = target_event;
  if producer is null or not public.can_enter_event(target_event) then raise exception 'Entry access is required'; end if;
  select id into member from public.memberships where producer_id = producer and roper_id = target_roper;
  if member is null then raise exception 'Choose a roper from this producer'; end if;
  for r in select * from public.event_ropings where event_id = target_event loop
    if not public.can_enter_roping(r.id) then continue; end if;
    candidate := null;
    candidate.event_roping_id := r.id;
    candidate.event_id := target_event;
    candidate.producer_id := producer;
    candidate.roper_id := target_roper;
    candidate.membership_id := member;
    if r.incentive_enabled then
      select a.classification_id into candidate.handicap_classification_id
        from public.event_roping_handicap_adjustments a
        join public.membership_classification_history h on h.classification_id = a.classification_id
          and h.membership_id = member and h.effective_on <= r.scheduled_date
          and (h.ended_on is null or h.ended_on >= r.scheduled_date)
        where a.event_roping_id = r.id order by h.effective_on desc,h.created_at desc limit 1;
    end if;
    reason := public.entry_classification_failure(candidate);
    if reason is null then reason := public.standings_qualification_failure(r.id,target_roper); end if;
    if public.member_fine_blocks(producer,target_roper,r.id,'entry') then reason := 'An unpaid fine prevents entry'; end if;
    if public.membership_suspension_blocks(producer,target_roper,r.id) then reason := 'A suspension prevents entry on these dates'; end if;
    allowance := public.roping_entry_allowance(r.id,target_roper);
    if allowance is not null and (select count(*) from public.roping_entries where event_roping_id = r.id
      and roper_id = target_roper and competition_status = 'active') >= allowance then
      reason := 'Entry allowance reached';
    end if;
    if r.event_day_status = 'completed' then reason := 'This roping is complete'; end if;
    roping_id := r.id;
    return next;
  end loop;
end;
$$;
revoke all on function public.walk_up_entry_eligibility(uuid,uuid) from public,anon;
grant execute on function public.walk_up_entry_eligibility(uuid,uuid) to authenticated;
