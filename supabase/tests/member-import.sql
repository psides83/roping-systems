begin;
do $$
declare owner_id uuid; producer uuid; batch uuid; payload jsonb; preview jsonb; result jsonb; member_id uuid; division uuid; class_id uuid; second_class uuid;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  select id into strict producer from public.producers where slug='ultimate-calf-roping';
  select id,division_id into class_id,division from public.classifications where producer_id=producer and eligibility_type='skill' and is_active limit 1;
  payload:=jsonb_build_object('memberNumber','IMPORT-ROLLBACK-'||gen_random_uuid(),'firstName','Import','lastName','Tester','gender','female','phone','2545551234','email','import-'||gen_random_uuid()||'@example.com','address','123 Test St','zip','00123','classifications',jsonb_build_array(jsonb_build_object('divisionId',division,'classificationId',class_id)));
  preview:=public.import_member_row(producer,2,payload,current_date);
  if preview->>'operation'<>'create' or preview ? 'error' then raise exception 'Preview failed: %',preview; end if;
  batch:=public.begin_member_import(producer,'rollback.csv','{}');
  result:=public.import_member_row(producer,2,payload,current_date,batch,preview->>'snapshot',true);
  if result ? 'error' then raise exception 'Create failed: %',result; end if;
  member_id:=(result->>'membershipId')::uuid;
  if not exists(select 1 from public.memberships where id=member_id and profile_fields->>'street_address'='123 Test St' and profile_fields->>'postal_code'='00123') then raise exception 'Profile mapping failed'; end if;
  result:=public.import_member_row(producer,2,payload,current_date,batch,preview->>'snapshot',true);
  if result->>'alreadyImported'<>'true' then raise exception 'Retry duplicated import: %',result; end if;
  payload:=payload-'phone'; payload:=jsonb_set(payload,'{firstName}','"Updated"');
  preview:=public.import_member_row(producer,3,payload,current_date);
  result:=public.import_member_row(producer,3,payload,current_date,batch,preview->>'snapshot',true);
  if result ? 'error' then raise exception 'Update failed: %',result; end if;
  if not exists(select 1 from public.ropers r join public.memberships m on m.roper_id=r.id where m.id=member_id and r.phone='2545551234' and r.first_name='Updated') then raise exception 'Update did not preserve blank phone'; end if;
  select id into second_class from public.classifications where producer_id=producer and division_id=division and eligibility_type='skill' and is_active and id<>class_id limit 1;
  if second_class is not null then
    payload:=jsonb_set(payload,'{classifications}',jsonb_build_array(jsonb_build_object('divisionId',division,'classificationId',second_class)));
    preview:=public.import_member_row(producer,6,payload,current_date);
    result:=public.import_member_row(producer,6,payload,current_date,batch,preview->>'snapshot',true);
    if result ? 'error' then raise exception 'Classification update failed: %',result; end if;
    if not exists(select 1 from public.membership_classification_history where membership_id=member_id and classification_id=class_id and ended_on is not null)
      or not exists(select 1 from public.membership_classification_history where membership_id=member_id and classification_id=second_class and ended_on is null) then raise exception 'Classification history lost'; end if;
  end if;
  result:=public.import_member_row(producer,4,jsonb_set(payload,'{firstName}','"Stale"'),current_date,batch,'stale',true);
  if result->>'error' not like '%changed after preview%' then raise exception 'Stale preview accepted: %',result; end if;
  select c.id,c.division_id into strict class_id,division from public.classifications c join public.divisions d on d.id=c.division_id
    where c.producer_id=producer and c.eligibility_type='open' and c.is_active and lower(d.name) like '%breakaway%' limit 1;
  payload:=jsonb_set(payload,'{classifications}',jsonb_build_array(jsonb_build_object('divisionId',division,'classificationId',class_id)));
  preview:=public.import_member_row(producer,7,payload,current_date);
  result:=public.import_member_row(producer,7,payload,current_date,batch,preview->>'snapshot',true);
  if result ? 'error' or not exists(select 1 from public.membership_classification_history where membership_id=member_id and classification_id=class_id and ended_on is null) then raise exception 'Open breakaway import failed: %',result; end if;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  result:=public.import_member_row(producer,5,payload,current_date);
  if result->>'error' not like '%management access%' then raise exception 'Unauthorized import accepted'; end if;
end;
$$;
rollback;
