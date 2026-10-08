alter table public.online_entry_submissions add column producer_response text
  check (length(producer_response)<=1000);

create function public.review_online_entry_with_response(target_request_id uuid,expected_revision integer,
  review_decision public.entry_request_status,entered_review_note text,override_eligibility boolean,roper_response text)
returns integer language plpgsql security definer set search_path='' as $$
declare result integer;
begin
  if length(coalesce(roper_response,''))>1000 then raise exception 'Keep the roper message under 1000 characters'; end if;
  result:=public.review_online_entry_at_revision(target_request_id,expected_revision,review_decision,entered_review_note,override_eligibility);
  update public.online_entry_submissions set producer_response=nullif(trim(roper_response),'') where id=target_request_id;
  return result;
end; $$;
revoke all on function public.review_online_entry_with_response(uuid,integer,public.entry_request_status,text,boolean,text) from public,anon;
grant execute on function public.review_online_entry_with_response(uuid,integer,public.entry_request_status,text,boolean,text) to authenticated;

do $$
declare source text:=pg_get_functiondef('public.online_entry_submission_details(uuid)'::regprocedure);
begin
  if strpos(source,'''reviewedAt'',s.reviewed_at')=0 then raise exception 'Request details changed; review response projection'; end if;
  execute replace(source,'''reviewedAt'',s.reviewed_at','''producerResponse'',s.producer_response,''reviewedAt'',s.reviewed_at');
end; $$;

create function public.my_online_entry_fee_context(target_producer_slug text,target_event_slug text,target_member_number text,target_email text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare member public.memberships%rowtype; target_event_id uuid; account_data jsonb; event_data jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in to check your current charges'; end if;
  select e.id into target_event_id from public.events e join public.producers p on p.id=e.producer_id
    where p.slug=target_producer_slug and e.slug=target_event_slug and e.is_public
      and e.publication_state='published' and e.status<>'cancelled';
  if target_event_id is null then raise exception 'This event is not available'; end if;
  select m.* into member from public.memberships m join public.ropers r on r.id=m.roper_id
    join public.events e on e.id=target_event_id and e.producer_id=m.producer_id
    where public.owns_membership(m.id) and lower(trim(m.member_number))=lower(trim(target_member_number))
      and lower(trim(r.email))=lower(trim(target_email));
  if member.id is null then raise exception 'Connect this membership before checking your current charges'; end if;
  account_data:=public.my_roper_accounts(member.id);
  select x into event_data from jsonb_array_elements(account_data->'events') x where x->>'id'=target_event_id::text;
  return jsonb_build_object('account',event_data,'coveredFeeKeys',coalesce((
    select jsonb_agg(distinct case when f.scope='contestant_division' then f.event_roping_id::text||':'||f.id::text else f.id::text end)
    from public.entry_charges c join public.event_fees f on f.id=c.event_fee_id and f.producer_id=c.producer_id
    where c.event_id=target_event_id and c.roper_id=member.roper_id and c.producer_id=member.producer_id and f.scope<>'entry'
  ),'[]'::jsonb));
end; $$;
revoke all on function public.my_online_entry_fee_context(text,text,text,text) from public,anon;
grant execute on function public.my_online_entry_fee_context(text,text,text,text) to authenticated;
