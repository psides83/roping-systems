-- Share the existing classification/age/gender rules with a read-only preview.
do $migration$
declare source text := pg_get_functiondef('public.enforce_entry_classification_eligibility()'::regprocedure);
  declarations text; setup text; rules text; start_at integer; end_at integer;
begin
  start_at := strpos(source, 'declare');
  end_at := strpos(source, '  if tg_op =');
  if start_at=0 or end_at=0 then raise exception 'Eligibility setup changed; review preview extraction'; end if;
  setup := substr(source,start_at,end_at-start_at);
  start_at := strpos(source, '  select * into contestant_record');
  end_at := strpos(source, '  if eligibility_failure is null then eligibility_failure := public.standings_qualification_failure');
  if start_at=0 or end_at<=start_at then raise exception 'Eligibility rules changed; review preview extraction'; end if;
  rules := substr(source,start_at,end_at-start_at);
  declarations := 'create function public.entry_classification_failure(new public.roping_entries) returns text language plpgsql stable security definer set search_path='''' as $body$';
  execute declarations || setup || rules || ' return eligibility_failure; end; $body$';
  source := replace(source,rules,'  eligibility_failure := public.entry_classification_failure(new);' || E'\n' ||
    '  if eligibility_failure is null and new.membership_id is null and division_record.competition_format <> ''handicap'' and target_classification.eligibility_type = ''skill'' then new.eligibility_note := ''Guest skill eligibility accepted by event staff''; end if;' || E'\n');
  execute source;
end;
$migration$;
revoke all on function public.entry_classification_failure(public.roping_entries) from public,anon,authenticated;

create function public.my_online_entry_eligibility(target_producer_slug text,target_event_slug text,target_member_number text,target_email text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare event_record public.events%rowtype; member_record public.memberships%rowtype;
  roping public.event_ropings%rowtype; candidate public.roping_entries%rowtype;
  failure text; qualification text; messages jsonb; result jsonb := '[]';
  allowance integer; used integer; review_needed boolean; restricted boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to check your membership eligibility'; end if;
  select e.* into event_record from public.events e join public.producers p on p.id=e.producer_id
    where p.slug=target_producer_slug and e.slug=target_event_slug and e.is_public
      and e.publication_state='published' and e.status<>'cancelled';
  if event_record.id is null then raise exception 'This event is not available'; end if;
  -- Ownership, not contact details, grants access to private eligibility information.
  select m.* into member_record from public.memberships m join public.ropers r on r.id=m.roper_id
    where m.producer_id=event_record.producer_id and public.owns_membership(m.id)
      and lower(trim(m.member_number))=lower(trim(target_member_number))
      and lower(trim(r.email))=lower(trim(target_email));
  if member_record.id is null then raise exception 'Connect this membership in your roper portal before checking eligibility. Guest requests are reviewed by the producer'; end if;
  for roping in select * from public.event_ropings where event_id=event_record.id order by sort_order,id loop
    candidate := null;
    candidate.event_roping_id:=roping.id; candidate.event_id:=event_record.id;
    candidate.producer_id:=event_record.producer_id; candidate.roper_id:=member_record.roper_id;
    candidate.membership_id:=case when member_record.status='active' then member_record.id else null end;
    if candidate.membership_id is not null and roping.competition_format='handicap' then
      select rule.classification_id into candidate.handicap_classification_id
      from public.event_roping_handicap_adjustments rule
      join public.membership_classification_history h on h.classification_id=rule.classification_id
        and h.membership_id=member_record.id and h.effective_on<=roping.scheduled_date
        and (h.ended_on is null or h.ended_on>=roping.scheduled_date)
      where rule.event_roping_id=roping.id order by h.effective_on desc,h.created_at desc limit 1;
    end if;
    messages:='[]'; review_needed:=false; restricted:=false;
    failure:=public.entry_classification_failure(candidate);
    if failure is not null then restricted:=true; messages:=messages || jsonb_build_array(failure); end if;
    if public.member_fine_blocks(event_record.producer_id,member_record.roper_id,roping.id,'entry') then
      restricted:=true;
      messages:=messages || jsonb_build_array('An unpaid fine prevents new entries. Contact the producer to resolve it.');
    elsif public.member_fine_blocks(event_record.producer_id,member_record.roper_id,roping.id,'competition') then
      review_needed:=true;
      messages:=messages || jsonb_build_array('An unpaid fine must be resolved before you compete in this roping.');
    end if;
    if public.membership_suspension_blocks(event_record.producer_id,member_record.roper_id,roping.id) then
      restricted:=true;
      messages:=messages || jsonb_build_array('A membership suspension prevents entry on these dates. Contact the producer.');
    end if;
    qualification:=public.standings_qualification_failure(roping.id,member_record.roper_id);
    if qualification is not null then
      messages:=messages || jsonb_build_array(qualification);
      review_needed:=true;
    end if;
    allowance:=public.roping_entry_allowance(roping.id,member_record.roper_id);
    select count(*) into used from public.roping_entries e where e.event_roping_id=roping.id
      and e.roper_id=member_record.roper_id and e.competition_status='active';
    if allowance is not null and used>=allowance then
      restricted:=true;
      messages:=messages || jsonb_build_array('You have reached the entry allowance for this roping.');
    end if;
    if roping.event_day_status in ('in_progress','completed') then
      restricted:=true;
      messages:=messages || jsonb_build_array('This roping has already started. Contact the event office about late entries.');
    end if;
    result:=result || jsonb_build_array(jsonb_build_object('event_roping_id',roping.id,
      'status',case when restricted then 'restricted' when review_needed then 'review' else 'eligible' end,
      'messages',messages,'remaining_entries',case when allowance is null then null else greatest(0,allowance-used) end));
  end loop;
  return result;
end; $$;
revoke all on function public.my_online_entry_eligibility(text,text,text,text) from public,anon;
grant execute on function public.my_online_entry_eligibility(text,text,text,text) to authenticated;
