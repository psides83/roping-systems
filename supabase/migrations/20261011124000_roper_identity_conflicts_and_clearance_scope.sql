do $$
declare definition text; updated text;
begin
  select pg_get_functiondef('public.create_guest_event_entry_v2_with_eligibility_override(uuid,text,text,text,text,date,public.competition_gender,public.payment_status,text)'::regprocedure) into definition;
  updated:=replace(definition,'if selected_person_id is null then
    insert into public.ropers',
    'if selected_person_id is null and exists(select 1 from public.ropers where lower(email)=lower(trim(guest_email))) then
    raise exception ''This email belongs to a different roper record. Choose the existing roper or provide a different email.'';
  end if;
  if selected_person_id is null then
    insert into public.ropers');
  if updated=definition then raise exception 'Office identity conflict guard definition changed'; end if;
  execute updated;
  select pg_get_functiondef('public.review_online_entry_request_with_eligibility_override(uuid,public.entry_request_status,text,boolean)'::regprocedure) into definition;
  updated:=replace(definition,'if selected_person_id is null then
      insert into public.ropers',
    'if selected_person_id is null and exists(select 1 from public.ropers where lower(email)=lower(request_record.email)) then
      raise exception ''This email belongs to a different roper record. Confirm the contestant identity before accepting.'';
    end if;
    if selected_person_id is null then
      insert into public.ropers');
  if updated=definition then raise exception 'Online identity conflict guard definition changed'; end if;
  execute updated;
end $$;

create or replace function public.event_entry_competition_holds(target_roping_id uuid)
returns table(entry_id uuid,membership_id uuid,hold_reason text)
language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from public.event_ropings r where r.id=target_roping_id and (
    public.can_enter_roping(r.id) or public.can_time_roping(r.id)
    or public.can_finance_event(r.event_id)
    or exists(select 1 from public.producer_staff s where s.producer_id=r.producer_id
      and s.user_id=auth.uid() and s.role in ('owner','admin','viewer'))))
    then raise exception 'Event access required'; end if;
  return query select e.id,e.membership_id,public.entry_competition_hold(e.id)
    from public.roping_entries e where e.event_roping_id=target_roping_id;
end $$;
