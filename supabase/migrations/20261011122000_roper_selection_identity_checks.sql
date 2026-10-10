do $$
declare definition text; updated text;
begin
  select pg_get_functiondef('public.review_online_entry_request_with_eligibility_override(uuid,public.entry_request_status,text,boolean)'::regprocedure) into definition;
  updated:=replace(definition,
    'coalesce(request_record.roper_id,(select roper_id from public.memberships where id=request_record.requested_membership_id and producer_id=request_record.producer_id))',
    'coalesce((select roper_id from public.memberships where id=request_record.requested_membership_id and producer_id=request_record.producer_id),request_record.roper_id)');
  if updated=definition then raise exception 'Selected record review definition changed'; end if;
  execute updated;
  select pg_get_functiondef('public.submit_online_entry_request(text,text,text,text,text,text,text,text,jsonb)'::regprocedure) into definition;
  updated:=replace(definition,
    'and lower(membership.member_number) = lower(trim(contestant_member_number)) and lower(person.email) = lower(trim(contestant_email))',
    'and lower(membership.member_number) = lower(trim(contestant_member_number)) and lower(person.email) = lower(trim(contestant_email)) and lower(trim(person.first_name))=lower(trim(contestant_first_name)) and lower(trim(person.last_name))=lower(trim(contestant_last_name))');
  if updated=definition then raise exception 'Online membership matching definition changed'; end if;
  execute updated;
end $$;
