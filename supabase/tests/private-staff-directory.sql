begin;
do $$
begin
  if has_function_privilege('anon','private.producer_staff_directory_rows()','execute')
    or has_schema_privilege('authenticated','private','usage') then
    raise exception 'API roles can call the private auth lookup directly';
  end if;
  if exists (
    select 1 from pg_rewrite rewrite
    join pg_depend dependency on dependency.classid='pg_rewrite'::regclass and dependency.objid=rewrite.oid
    where rewrite.ev_class='public.producer_staff_directory'::regclass
      and dependency.refclassid='pg_class'::regclass
      and dependency.refobjid='auth.users'::regclass
  ) then
    raise exception 'The API view still directly references auth.users';
  end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
do $$
begin
  if exists (select 1 from public.producer_staff_directory) then
    raise exception 'Unrelated authenticated user can read directory rows';
  end if;
end;
$$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
do $$
begin
  if exists (select 1 from public.producer_staff_directory) then
    raise exception 'Request without a user can read directory rows';
  end if;
end;
$$;
rollback;
