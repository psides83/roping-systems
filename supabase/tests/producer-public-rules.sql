-- Exercises actual authenticated and anonymous access; retains no fixture data.
begin;
do $$
declare owner_id uuid; producer uuid; slug text; staff uuid; role_name text; rev integer; result jsonb; doc jsonb;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  slug:='rules-rollback-'||gen_random_uuid()::text;
  producer:=public.create_organization('Rules rollback test',slug);
  doc:='{"title":"Rules","introduction":"","effectiveOn":"2026-10-08","sections":[],"attachments":[]}'::jsonb;
  execute 'set local role authenticated';
  rev:=public.save_producer_rules(producer,0,doc,'save');
  if rev<>1 then raise exception 'First draft revision incorrect'; end if;
  begin
    perform public.save_producer_rules(producer,rev,doc,'publish');
    raise exception 'Incomplete rules published';
  exception when others then
    if sqlerrm<>'Add a title and at least one rules section before publishing' then raise; end if;
  end;
  execute 'reset role';
  execute 'set local role anon';
  result:=public.public_producer_rules(slug);
  if result->'document'<>'null'::jsonb or result ? 'draft' or result ? 'revision' then raise exception 'Draft leaked'; end if;
  begin
    perform 1 from public.producer_rules;
    raise exception 'Anonymous read private table';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  doc:=jsonb_set(doc,'{sections}','[{"id":"10000000-0000-4000-8000-000000000001","title":"Membership","content":"Published text","subsections":[]}]');
  execute 'set local role authenticated';
  rev:=public.save_producer_rules(producer,rev,doc,'publish');
  doc:=jsonb_set(doc,'{sections,0,content}','"Private changes"');
  rev:=public.save_producer_rules(producer,rev,doc,'save');
  begin
    perform public.save_producer_rules(producer,rev-1,doc,'save');
    raise exception 'Stale edit overwrote draft';
  exception when others then
    if sqlerrm<>'Another administrator updated these rules. Reload before saving' then raise; end if;
  end;
  execute 'reset role';
  execute 'set local role anon';
  result:=public.public_producer_rules(slug);
  if result#>>'{document,sections,0,content}'<>'Published text' or result::text like '%Private changes%' then raise exception 'Saved draft changed public rules'; end if;
  execute 'reset role';
  foreach role_name in array array['admin','operator','event_manager','treasurer','entry_office','timing_staff','viewer'] loop
    perform set_config('request.jwt.claim.sub',owner_id::text,true);
    staff:=gen_random_uuid();
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(staff,'rules-'||staff::text||'@example.com',now(),'{}');
    insert into public.producer_staff(producer_id,user_id,role) values(producer,staff,role_name::public.organization_role);
    perform set_config('request.jwt.claim.sub',staff::text,true);
    execute 'set local role authenticated';
    if role_name='admin' then
      rev:=public.save_producer_rules(producer,rev,doc,'save');
    else
      if exists(select 1 from public.producer_rules where producer_id=producer) then raise exception '% read draft',role_name; end if;
      begin
        perform public.save_producer_rules(producer,rev,doc,'save');
        raise exception '% edited rules',role_name;
      exception when others then
        if sqlerrm<>'Only an owner or administrator can manage public rules' then raise; end if;
      end;
    end if;
    execute 'reset role';
  end loop;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  execute 'set local role authenticated';
  rev:=public.save_producer_rules(producer,rev,doc,'unpublish');
  execute 'reset role';
  if public.public_producer_rules(slug)->'document'<>'null'::jsonb then raise exception 'Unpublished rules still visible'; end if;
  if not exists(select 1 from public.producer_audit_log where producer_id=producer and entity_type='producer_rules' and actor_user_id=owner_id) then raise exception 'Missing rules changelog'; end if;
  raise notice 'Rules drafts, publication, revisions, permissions and changelog passed';
end $$;
rollback;
