alter table public.online_entry_submissions add column requested_membership_id uuid
references public.memberships(id) on delete set null;

-- A search selection is a staff-review suggestion, never account ownership.
create function public.search_event_roper_records(producer_slug text,event_slug text,search_text text)
returns table(record_id uuid,first_name text,last_name text,member_number text,city text,state text)
language plpgsql stable security definer set search_path='' as $$
declare producer uuid;
begin
  if length(trim(coalesce(search_text,''))) not between 3 and 80 then return; end if;
  select p.id into producer from public.producers p join public.events e on e.producer_id=p.id
    where p.slug=producer_slug and e.slug=event_slug and e.publication_state='published' and e.is_public
      and e.status not in ('entries_closed','in_progress','completed','cancelled')
      and (e.entries_open_at is null or e.entries_open_at<=now())
      and (e.entries_close_at is null or e.entries_close_at>now())
      and not exists(select 1 from public.producer_feature_preferences f
        where f.producer_id=p.id and f.features->>'online_entries'='false');
  if producer is null then return; end if;
  return query select m.id,r.first_name,r.last_name,m.member_number,
      m.profile_fields->>'city',m.profile_fields->>'state'
    from public.memberships m join public.ropers r on r.id=m.roper_id
    where m.producer_id=producer and
      (strpos(lower(r.first_name||' '||r.last_name),lower(trim(search_text)))>0
        or lower(m.member_number)=lower(trim(search_text)))
    order by r.last_name,r.first_name,m.member_number limit 10;
end $$;
revoke all on function public.search_event_roper_records(text,text,text) from public;
grant execute on function public.search_event_roper_records(text,text,text) to anon,authenticated;

create function public.submit_online_entry_request_v4(
  target_organization_slug text,target_roping_slug text,contestant_first_name text,
  contestant_last_name text,contestant_email text,contestant_phone text,
  contestant_birth_date date,contestant_competition_gender public.competition_gender,
  contestant_member_number text,contestant_note text,requested_divisions jsonb,
  selected_record_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare request_id uuid;
begin
  if selected_record_id is not null and not exists(select 1
    from public.memberships m join public.producers p on p.id=m.producer_id
    join public.ropers r on r.id=m.roper_id
    where m.id=selected_record_id and p.slug=target_organization_slug
      and lower(trim(r.first_name))=lower(trim(contestant_first_name))
      and lower(trim(r.last_name))=lower(trim(contestant_last_name))) then
    raise exception 'The selected roper record does not match. Search again or choose a new roper.';
  end if;
  request_id:=public.submit_online_entry_request_v3(target_organization_slug,target_roping_slug,
    contestant_first_name,contestant_last_name,contestant_email,contestant_phone,
    contestant_birth_date,contestant_competition_gender,contestant_member_number,
    contestant_note,requested_divisions);
  update public.online_entry_submissions set requested_membership_id=selected_record_id
    where id=request_id;
  return request_id;
end $$;
revoke all on function public.submit_online_entry_request_v4(text,text,text,text,text,text,date,public.competition_gender,text,text,jsonb,uuid) from public;
grant execute on function public.submit_online_entry_request_v4(text,text,text,text,text,text,date,public.competition_gender,text,text,jsonb,uuid) to anon,authenticated;

do $$
declare definition text; updated text;
begin
  select pg_get_functiondef('public.review_online_entry_request_with_eligibility_override(uuid,public.entry_request_status,text,boolean)'::regprocedure) into definition;
  updated:=replace(definition,'selected_person_id := request_record.roper_id;',
    'selected_person_id := coalesce(request_record.roper_id,(select roper_id from public.memberships where id=request_record.requested_membership_id and producer_id=request_record.producer_id));');
  if updated=definition then raise exception 'Online review definition changed'; end if;
  updated:=replace(updated,'where lower(email) = lower(request_record.email)',
    'where lower(email) = lower(request_record.email) and lower(trim(first_name))=lower(trim(request_record.first_name)) and lower(trim(last_name))=lower(trim(request_record.last_name))');
  definition:=updated;
  updated:=replace(definition,'elsif public.can_manage_event(request_record.event_id) then
      update public.ropers
      set birth_date = coalesce(birth_date, request_record.birth_date),
          competition_gender = coalesce(
            request_record.competition_gender,
            competition_gender
          )
      where id = selected_person_id;',
    '-- A submitted request cannot overwrite an existing roper profile.');
  if updated=definition then raise exception 'Online profile-update guard definition changed'; end if;
  execute updated;
  select pg_get_functiondef('public.create_guest_event_entry_v2_with_eligibility_override(uuid,text,text,text,text,date,public.competition_gender,public.payment_status,text)'::regprocedure) into definition;
  updated:=replace(definition,'where lower(email) = lower(trim(guest_email))',
    'where lower(email) = lower(trim(guest_email)) and lower(trim(first_name))=lower(trim(guest_first_name)) and lower(trim(last_name))=lower(trim(guest_last_name))');
  if updated=definition then raise exception 'Guest identity matching definition changed'; end if;
  definition:=updated;
  updated:=replace(definition,'elsif public.can_manage_event_roping(target_roping_division_id) then
    update public.ropers
    set birth_date = coalesce(birth_date, guest_birth_date),
        competition_gender = guest_competition_gender
    where id = selected_person_id;',
    '-- Edit existing roper details explicitly from their record.');
  if updated=definition then raise exception 'Guest profile-update guard definition changed'; end if;
  execute updated;
end $$;
