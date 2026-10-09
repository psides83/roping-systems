-- Exercises actual authenticated and anonymous access; retains no fixture data.
begin;
do $$
declare owner_id uuid; producer uuid; slug text; staff uuid; role_name text; rev integer; bulletin uuid:=gen_random_uuid(); result jsonb; doc jsonb;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  slug:='bulletin-rollback-'||gen_random_uuid()::text;
  producer:=public.create_organization('Rules rollback test',slug);
  doc:='{"title":"Rules","introduction":"","effectiveOn":"2026-10-08","sections":[],"attachments":[]}'::jsonb;
  execute 'set local role authenticated';
  rev:=public.save_producer_bulletins(producer,bulletin,0,doc,'save');
  if rev<>1 then raise exception 'First draft revision incorrect'; end if;
  begin
    perform public.save_producer_bulletins(producer,bulletin,rev,doc,'publish');
    raise exception 'Incomplete bulletin published';
  exception when others then
    if sqlerrm<>'Add a title and at least one bulletin section before publishing' then raise; end if;
  end;
  execute 'reset role';
  execute 'set local role anon';
  result:=public.public_producer_bulletins(slug);
  if jsonb_array_length(result->'bulletins')<>0 or result ? 'draft' or result ? 'revision' then raise exception 'Draft leaked'; end if;
  begin
    perform 1 from public.producer_bulletins;
    raise exception 'Anonymous read private table';
  exception when insufficient_privilege then null; end;
  execute 'reset role';
  doc:=jsonb_set(doc,'{sections}','[{"id":"10000000-0000-4000-8000-000000000001","title":"Membership","content":"Published text","subsections":[]}]');
  execute 'set local role authenticated';
  begin
    perform public.save_producer_bulletins(producer,bulletin,rev,jsonb_set(doc,'{effectiveOn}','""'),'publish');
    raise exception 'Undated bulletin published';
  exception when others then
    if sqlerrm<>'Choose a bulletin date' then raise; end if;
  end;
  rev:=public.save_producer_bulletins(producer,bulletin,rev,doc,'publish');
  doc:=jsonb_set(doc,'{sections,0,content}','"Private changes"');
  rev:=public.save_producer_bulletins(producer,bulletin,rev,doc,'save');
  begin
    perform public.save_producer_bulletins(producer,bulletin,rev-1,doc,'save');
    raise exception 'Stale edit overwrote draft';
  exception when others then
    if sqlerrm<>'Another administrator updated these bulletin. Reload before saving' then raise; end if;
  end;
  execute 'reset role';
  execute 'set local role anon';
  result:=public.public_producer_bulletins(slug);
  if result#>>'{bulletins,0,document,sections,0,content}'<>'Published text' or result::text like '%Private changes%' then raise exception 'Saved draft changed public bulletin'; end if;
  execute 'reset role';
  foreach role_name in array array['admin','operator','event_manager','treasurer','entry_office','timing_staff','viewer'] loop
    perform set_config('request.jwt.claim.sub',owner_id::text,true);
    staff:=gen_random_uuid();
    insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values(staff,'bulletin-'||staff::text||'@example.com',now(),'{}');
    insert into public.producer_staff(producer_id,user_id,role) values(producer,staff,role_name::public.organization_role);
    perform set_config('request.jwt.claim.sub',staff::text,true);
    execute 'set local role authenticated';
    if role_name='admin' then
      rev:=public.save_producer_bulletins(producer,bulletin,rev,doc,'save');
    else
      if exists(select 1 from public.producer_bulletins where producer_id=producer) then raise exception '% read draft',role_name; end if;
      begin
        perform public.save_producer_bulletins(producer,bulletin,rev,doc,'save');
        raise exception '% edited bulletin',role_name;
      exception when others then
        if sqlerrm<>'Only an owner or administrator can manage public bulletin' then raise; end if;
      end;
    end if;
    execute 'reset role';
  end loop;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  execute 'set local role authenticated';
  rev:=public.save_producer_bulletins(producer,bulletin,rev,doc,'unpublish');
  execute 'reset role';
  if jsonb_array_length(public.public_producer_bulletins(slug)->'bulletins')<>0 then raise exception 'Unpublished bulletin still visible'; end if;
  if not exists(select 1 from public.producer_audit_log where producer_id=producer and entity_type='producer_bulletins' and actor_user_id=owner_id) then raise exception 'Missing bulletin changelog'; end if;
  execute 'set local role authenticated';
  rev:=public.save_producer_bulletins(producer,bulletin,rev,doc,'delete');
  execute 'reset role';
  if exists(select 1 from public.producer_bulletins where id=bulletin) then raise exception 'Bulletin not deleted'; end if;
  raise notice 'Rules drafts, publication, revisions, permissions and changelog passed';
end $$;
rollback;
