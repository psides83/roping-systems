create or replace function public.import_member_row(target_producer uuid,source_row integer,member_data jsonb,effective_on date,
  target_batch uuid default null,expected_snapshot text default null,apply_row boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.memberships%rowtype; p public.ropers%rowtype; matched uuid; match_count integer;
  snapshot text; operation text; before_data jsonb; changes jsonb; class_record record; existing public.member_import_rows%rowtype;
  incoming_email text:=nullif(lower(trim(member_data->>'email')),''); profile jsonb; result jsonb;
begin
  if not public.can_manage_organization(target_producer) then raise exception 'Member management access is required'; end if;
  if apply_row is null or source_row is null or source_row<1 or member_data is null or jsonb_typeof(member_data)<>'object' or octet_length(member_data::text)>12000 then raise exception 'Invalid import row'; end if;
  if apply_row then
    perform 1 from public.producers where id=target_producer for update;
    if not exists(select 1 from public.member_import_batches where id=target_batch and producer_id=target_producer and created_by=auth.uid()) then raise exception 'Choose your import batch for this producer'; end if;
    select * into existing from public.member_import_rows where batch_id=target_batch and row_number=source_row;
    if existing.membership_id is not null then
      if existing.payload_hash<>md5(member_data::text||effective_on::text) then raise exception 'This source row was already imported with different values'; end if;
      return jsonb_build_object('membershipId',existing.membership_id,'operation',existing.operation,'alreadyImported',true);
    end if;
  end if;
  if nullif(trim(member_data->>'memberNumber'),'') is null or nullif(trim(member_data->>'firstName'),'') is null or nullif(trim(member_data->>'lastName'),'') is null then raise exception 'Member number, first name, and last name are required'; end if;
  if length(member_data->>'memberNumber')>100 or length(member_data->>'firstName')>100 or length(member_data->>'lastName')>100 then raise exception 'Member number or name is too long'; end if;
  if incoming_email is not null and (length(incoming_email)>254 or incoming_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Invalid email address'; end if;
  if member_data ? 'phone' and member_data->>'phone' !~ '^\d{10}$' then raise exception 'Phone must have ten digits'; end if;
  if effective_on is null then raise exception 'Choose a classification effective date'; end if;
  select * into m from public.memberships where producer_id=target_producer and member_number=trim(member_data->>'memberNumber');
  if incoming_email is not null then
    select count(*),min(ms.id::text)::uuid into match_count,matched from public.memberships ms join public.ropers r on r.id=ms.roper_id where ms.producer_id=target_producer and lower(r.email)=incoming_email;
    if match_count>1 or (m.id is not null and matched is not null and m.id<>matched) then raise exception 'Member number and email identify different or ambiguous members'; end if;
    if m.id is null and matched is not null then select * into m from public.memberships where id=matched; end if;
  end if;
  if m.id is not null then
    select * into p from public.ropers where id=m.roper_id;
    operation:='update';
  elsif incoming_email is not null then
    select count(*) into match_count from public.ropers where lower(email)=incoming_email;
    if match_count>1 then raise exception 'Shared email matches multiple ropers; resolve the records individually'; end if;
    select * into p from public.ropers where lower(email)=incoming_email;
    operation:=case when p.id is null then 'create' else 'link' end;
    if p.id is not null and (lower(trim(p.first_name))<>lower(trim(member_data->>'firstName')) or lower(trim(p.last_name))<>lower(trim(member_data->>'lastName'))
      or (member_data ? 'birthDate' and p.birth_date is not null and p.birth_date<>(member_data->>'birthDate')::date)
      or (member_data ? 'gender' and p.competition_gender::text<>member_data->>'gender')) then
      raise exception 'This email belongs to a different shared roper profile; resolve the identity individually'; end if;
  else operation:='create'; end if;
  if coalesce(member_data->>'gender',p.competition_gender::text) not in ('female','male') or coalesce(member_data->>'gender',p.competition_gender::text) is null then raise exception 'Competition gender is required for a new roper'; end if;
  perform (coalesce(member_data->>'status',m.status::text,'active'))::public.membership_status;
  perform (member_data->>'birthDate')::date,(member_data->>'joinedOn')::date,(member_data->>'expiresOn')::date;
  if member_data ? 'birthDate' and (member_data->>'birthDate')::date>current_date then raise exception 'Birth date cannot be in the future'; end if;
  changes:=coalesce(member_data->'classifications','[]'::jsonb);
  if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>30 then raise exception 'Invalid classification mapping'; end if;
  if exists(select value->>'divisionId' from jsonb_array_elements(changes) group by value->>'divisionId' having count(*)>1) then raise exception 'Choose one classification per division'; end if;
  for class_record in select value from jsonb_array_elements(changes) loop
    if not exists(select 1 from public.classifications where id=(class_record.value->>'classificationId')::uuid and division_id=(class_record.value->>'divisionId')::uuid and producer_id=target_producer and is_active and eligibility_type in ('skill','open')) then raise exception 'A mapped member classification is unavailable'; end if;
  end loop;
  if apply_row then
    if m.id is not null then select * into m from public.memberships where id=m.id for update; end if;
    if p.id is not null then select * into p from public.ropers where id=p.id for update; end if;
  end if;
  before_data:=jsonb_build_object('memberNumber',m.member_number,'firstName',p.first_name,'lastName',p.last_name,'email',p.email,'phone',p.phone,'gender',p.competition_gender,'birthDate',p.birth_date,'status',m.status,'joinedOn',m.joined_on,'expiresOn',m.expires_on,'notes',m.notes,'profile',m.profile_fields);
  if operation='update' then
    before_data:=before_data||jsonb_build_object('classifications',coalesce((select jsonb_agg(jsonb_build_object('divisionId',h.division_id,'classificationId',h.classification_id)) from public.membership_classification_history h where h.membership_id=m.id and h.ended_on is null),'[]'::jsonb));
  end if;
  snapshot:=md5(coalesce(to_jsonb(m)::text,'null')||coalesce(to_jsonb(p)::text,'null')||coalesce((select jsonb_agg(to_jsonb(h) order by h.id)::text from public.membership_classification_history h where h.membership_id=m.id),'[]'));
  result:=jsonb_build_object('operation',operation,'snapshot',snapshot,'before',case when operation='link' then '{}'::jsonb else before_data end,'membershipId',m.id);
  if operation='link' then result:=result||jsonb_build_object('warning','Existing shared roper profile will be linked without changing its personal details.'); end if;
  if not apply_row then return result; end if;
  if expected_snapshot is null or expected_snapshot<>snapshot then raise exception 'This record changed after preview. Review it again before importing'; end if;
  profile:=coalesce(m.profile_fields,'{}'::jsonb);
  for class_record in select key,value from jsonb_each(member_data) where key in ('city','state','address','zip') loop profile:=profile||jsonb_build_object(case class_record.key when 'address' then 'street_address' when 'zip' then 'postal_code' else class_record.key end,class_record.value); end loop;
  if m.id is null then
    if p.id is null then
      insert into public.ropers(first_name,last_name,email,phone,birth_date,competition_gender) values(trim(member_data->>'firstName'),trim(member_data->>'lastName'),incoming_email,member_data->>'phone',(member_data->>'birthDate')::date,(member_data->>'gender')::public.competition_gender) returning * into p;
    end if;
    insert into public.memberships(producer_id,roper_id,member_number,status,joined_on,expires_on,notes,profile_fields)
      values(target_producer,p.id,trim(member_data->>'memberNumber'),coalesce(member_data->>'status','active')::public.membership_status,coalesce((member_data->>'joinedOn')::date,effective_on),(member_data->>'expiresOn')::date,member_data->>'notes',profile) returning * into m;
    for class_record in select value from jsonb_array_elements(changes) loop
      perform public.set_member_classification(target_producer,m.id,(class_record.value->>'classificationId')::uuid,effective_on,'Assigned by spreadsheet import',null);
    end loop;
  else
    perform public.update_organization_member_v2(target_producer,m.id,trim(member_data->>'firstName'),trim(member_data->>'lastName'),coalesce(incoming_email,p.email),coalesce(member_data->>'phone',p.phone),coalesce((member_data->>'birthDate')::date,p.birth_date),coalesce(member_data->>'gender',p.competition_gender::text)::public.competition_gender,trim(member_data->>'memberNumber'),coalesce(member_data->>'status',m.status::text)::public.membership_status,coalesce((member_data->>'joinedOn')::date,m.joined_on),coalesce((member_data->>'expiresOn')::date,m.expires_on),coalesce(member_data->>'notes',m.notes,''),(select coalesce(jsonb_agg(jsonb_build_object('disciplineId',value->>'divisionId','classificationId',value->>'classificationId')),'[]'::jsonb) from jsonb_array_elements(changes)),effective_on,'Updated by spreadsheet import',profile);
  end if;
  insert into public.member_import_rows(batch_id,row_number,membership_id,payload_hash,operation) values(target_batch,source_row,m.id,md5(member_data::text||effective_on::text),operation);
  insert into public.producer_audit_log(producer_id,actor_user_id,entity_type,entity_id,action,before_data,after_data) values(target_producer,auth.uid(),'memberships',m.id,'update',before_data,jsonb_build_object('import_batch',target_batch,'source_row',source_row,'operation',operation,'imported_values',member_data));
  return result||jsonb_build_object('membershipId',m.id);
exception when others then return jsonb_build_object('error',sqlerrm);
end;
$$;
revoke all on function public.begin_member_import(uuid,text,jsonb),public.import_member_row(uuid,integer,jsonb,date,uuid,text,boolean) from public,anon;
grant execute on function public.begin_member_import(uuid,text,jsonb),public.import_member_row(uuid,integer,jsonb,date,uuid,text,boolean) to authenticated;
