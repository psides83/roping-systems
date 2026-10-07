-- Entry Office may process eligible entries, never change eligibility facts or approve exceptions.
do $$
declare original text; updated text;
begin
  original := pg_get_functiondef('public.create_guest_event_entry_v2_with_eligibility_override(uuid,text,text,text,text,date,public.competition_gender,public.payment_status,text)'::regprocedure);
  updated := replace(original,'public.can_manage_event_roping(target_roping_division_id)',
    'exists(select 1 from public.event_ropings r where r.id=target_roping_division_id and public.can_enter_event(r.event_id))');
  updated := replace(updated,'else' || chr(10) || '    update public.ropers',
    'elsif public.can_manage_event_roping(target_roping_division_id) then' || chr(10) || '    update public.ropers');
  if updated=original then raise exception 'Guest entry permission check not found'; end if;
  execute updated;

  original := pg_get_functiondef('public.review_online_entry_request_with_eligibility_override(uuid,public.entry_request_status,text,boolean)'::regprocedure);
  updated := replace(original,'public.can_manage_event(request_record.event_id)','public.can_enter_event(request_record.event_id)');
  updated := replace(updated,'if request_record.status <>',
    'if coalesce(override_eligibility,false) and not public.can_manage_event(request_record.event_id) then raise exception ''Entry Office cannot approve eligibility exceptions''; end if;' || chr(10) || '  if request_record.status <>');
  updated := replace(updated,'else' || chr(10) || '      update public.ropers',
    'elsif public.can_manage_event(request_record.event_id) then' || chr(10) || '      update public.ropers');
  updated := replace(updated,'if review_decision = ''accepted'' then',
    'if exists(select 1 from public.online_entry_submission_ropings i join public.event_ropings r on r.id=i.event_roping_id where i.submission_id=request_record.id and (r.event_id<>request_record.event_id or r.producer_id<>request_record.producer_id)) then raise exception ''Request ropings must belong to the submission event''; end if;' || chr(10) || '  if review_decision = ''accepted'' then');
  if updated=original then raise exception 'Online review permission check not found'; end if;
  execute updated;
end;
$$;

create function public.correct_event_roper_contact(target_event uuid,target_roper uuid,contact_email text,contact_phone text,correction_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare producer uuid; previous jsonb; updated jsonb;
begin
  if not public.can_enter_event(target_event) then raise exception 'Entry access for this event is required'; end if;
  if length(trim(coalesce(correction_reason,''))) < 5 or length(correction_reason)>300 then
    raise exception 'Enter a correction reason between 5 and 300 characters'; end if;
  if nullif(trim(contact_email),'') is not null and (length(contact_email)>254 or contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then
    raise exception 'Enter a valid contact email'; end if;
  if nullif(trim(contact_phone),'') is not null and length(regexp_replace(contact_phone,'[^0-9]','','g'))<>10 then
    raise exception 'Enter a ten-digit phone number'; end if;
  select producer_id into producer from public.events where id=target_event;
  if not exists(select 1 from public.roping_entries where event_id=target_event and roper_id=target_roper) then
    raise exception 'Choose a contestant entered in this event'; end if;
  select jsonb_build_object('email',email,'phone',phone) into previous from public.ropers where id=target_roper for update;
  update public.ropers set email=nullif(lower(trim(contact_email)),''),phone=nullif(regexp_replace(contact_phone,'[^0-9]','','g'),'') where id=target_roper;
  select jsonb_build_object('email',email,'phone',phone,'reason',trim(correction_reason),'event_id',target_event) into updated from public.ropers where id=target_roper;
  insert into public.producer_audit_log(producer_id,actor_user_id,entity_type,entity_id,action,before_data,after_data)
    values(producer,auth.uid(),'ropers',target_roper,'UPDATE',previous,updated);
end;
$$;
revoke all on function public.correct_event_roper_contact(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.correct_event_roper_contact(uuid,uuid,text,text,text) to authenticated;
