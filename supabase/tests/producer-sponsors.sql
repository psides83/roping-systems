begin;
select set_config('request.jwt.claims',(select jsonb_build_object('sub',user_id,'role','authenticated')::text
  from public.producer_staff where role='owner' order by created_at,user_id limit 1),true);
set local role authenticated;
do $$ declare producer uuid; begin
  select id into producer from public.producers where public.can_administer_organization(id) order by id limit 1;
  if producer is null then raise exception 'An owner fixture is required'; end if;
  insert into public.producer_sponsors(id,producer_id,name,website_url,is_active)
    values('10000000-0000-4000-8000-000000000001',producer,'Visible sponsor test','https://example.com',true),
      ('10000000-0000-4000-8000-000000000002',producer,'Hidden sponsor test','',false);
  if not exists(select 1 from public.producer_sponsors where id='10000000-0000-4000-8000-000000000002') then raise exception 'Owner cannot manage hidden sponsor'; end if;
  begin
    update public.producer_sponsors set logo_path='another-producer/logo.png' where id='10000000-0000-4000-8000-000000000001';
    raise exception 'Foreign logo path accepted';
  exception when check_violation then null; end;
end $$;
reset role;
do $$ begin
  if not exists(select 1 from public.producer_audit_log where entity_type='producer_sponsors' and after_data->>'name'='Visible sponsor test') then raise exception 'Sponsor changes not audited'; end if;
  if not exists(select 1 from storage.buckets where id='sponsor-logos' and public and file_size_limit=2097152 and allowed_mime_types=array['image/png','image/jpeg','image/webp']) then raise exception 'Incorrect logo bucket'; end if;
end $$;
set local role anon;
do $$ begin
  if not exists(select 1 from public.producer_sponsors where id='10000000-0000-4000-8000-000000000001') then raise exception 'Public sponsor missing'; end if;
  if exists(select 1 from public.producer_sponsors where id='10000000-0000-4000-8000-000000000002') then raise exception 'Hidden sponsor exposed'; end if;
  begin
    delete from public.producer_sponsors where id='10000000-0000-4000-8000-000000000001';
    raise exception 'Anonymous delete accepted';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
set local role authenticated;
do $$ declare changed bigint; begin
  update public.producer_sponsors set name='Unauthorized' where id='10000000-0000-4000-8000-000000000001';
  get diagnostics changed=row_count;
  if changed<>0 then raise exception 'Unrelated user updated sponsor'; end if;
end $$;
reset role;
rollback;
