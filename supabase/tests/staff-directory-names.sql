begin;
do $$
declare owner_id uuid; actual text; count_rows integer;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  update public.ropers set first_name='Avery',last_name='Teststaff' where auth_user_id=owner_id;
  select display_name into strict actual from public.producer_staff_directory where user_id=owner_id limit 1;
  if actual<>'Avery Teststaff' then raise exception 'Linked account name was not shown'; end if;
  update public.ropers set first_name='',last_name='' where auth_user_id=owner_id;
  update auth.users set raw_user_meta_data=coalesce(raw_user_meta_data,'{}')||'{"first_name":"Morgan","last_name":"Fallback"}'::jsonb where id=owner_id;
  select display_name into strict actual from public.producer_staff_directory where user_id=owner_id limit 1;
  if actual<>'Morgan Fallback' then raise exception 'Account metadata fallback was not shown'; end if;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  select count(*) into count_rows from public.producer_staff_directory;
  if count_rows<>0 then raise exception 'Staff names were exposed to an unrelated user'; end if;
  if has_table_privilege('anon','public.producer_staff_directory','select') then raise exception 'Anonymous users can read the staff directory'; end if;
end;
$$;
rollback;
