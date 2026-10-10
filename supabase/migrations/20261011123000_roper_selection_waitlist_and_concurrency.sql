do $$
declare definition text; updated text;
begin
  select pg_get_functiondef('public.waitlist_online_submission(uuid,integer)'::regprocedure) into definition;
  updated:=replace(definition,
    'for item in select * from public.online_entry_submission_ropings where submission_id=s.id order by event_roping_id loop',
    's.roper_id:=coalesce((select roper_id from public.memberships where id=s.requested_membership_id and producer_id=s.producer_id),s.roper_id);
  for item in select * from public.online_entry_submission_ropings where submission_id=s.id order by event_roping_id loop');
  if updated=definition then raise exception 'Online waitlist definition changed'; end if;
  execute updated;
  select pg_get_functiondef('public.review_online_entry_request_with_eligibility_override(uuid,public.entry_request_status,text,boolean)'::regprocedure) into definition;
  updated:=replace(definition,'if review_decision = ''accepted'' then
    selected_person_id :=',
    'if review_decision = ''accepted'' then
    perform pg_advisory_xact_lock(hashtextextended(lower(trim(request_record.email))||lower(trim(request_record.first_name))||lower(trim(request_record.last_name)),0));
    selected_person_id :=');
  if updated=definition then raise exception 'Online enrollment definition changed'; end if;
  execute updated;
  select pg_get_functiondef('public.create_guest_event_entry_v2_with_eligibility_override(uuid,text,text,text,text,date,public.competition_gender,public.payment_status,text)'::regprocedure) into definition;
  updated:=replace(definition,'if nullif(trim(guest_email), '''') is not null then',
    'if nullif(trim(guest_email), '''') is not null then
    perform pg_advisory_xact_lock(hashtextextended(lower(trim(guest_email))||lower(trim(guest_first_name))||lower(trim(guest_last_name)),0));');
  if updated=definition then raise exception 'Office enrollment definition changed'; end if;
  execute updated;
end $$;
