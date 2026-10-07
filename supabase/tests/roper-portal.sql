begin;
do $$
declare
  account uuid; roper uuid; payload jsonb; member jsonb; entry jsonb;
begin
  select id into strict account from auth.users where lower(email)='psides83@hotmail.com';
  select r.id into strict roper from public.ropers r where exists(select 1 from public.memberships m where m.roper_id=r.id) limit 1;
  update public.ropers set auth_user_id=null where auth_user_id=account;
  update public.ropers set auth_user_id=account where id=roper;
  perform set_config('request.jwt.claim.sub',account::text,true);
  payload:=public.my_roper_portal();
  if jsonb_array_length(payload->'memberships') <> (select count(*) from public.memberships where roper_id=roper) then raise exception 'Linked memberships missing'; end if;
  for member in select value from jsonb_array_elements(payload->'memberships') loop
    if not exists(select 1 from public.memberships m where m.id=(member->>'id')::uuid and m.roper_id=roper) then raise exception 'Another roper membership leaked'; end if;
    for entry in select value from jsonb_array_elements(member->'entries') loop
      if not exists(select 1 from public.roping_entries e join public.memberships m on m.id=(member->>'id')::uuid where e.id=(entry->>'id')::uuid and e.roper_id=roper and e.producer_id=m.producer_id) then raise exception 'Entry scope leaked'; end if;
    end loop;
  end loop;
  perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
  if jsonb_array_length(public.my_roper_portal()->'memberships') <> 0 then raise exception 'Unlinked account saw memberships'; end if;
  if has_function_privilege('anon','public.my_roper_portal()','EXECUTE') then raise exception 'Anonymous portal access granted'; end if;
end;
$$;
rollback;
