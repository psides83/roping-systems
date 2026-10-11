create table public.platform_producer_exports (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete restrict,
  requested_by uuid not null references auth.users(id) on delete restrict,
  reason text not null check(length(reason) between 5 and 1000),
  status text not null default 'generating' check(status in ('generating','ready','failed','removed')),
  object_path text not null unique,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  byte_count bigint,
  sha256 text,
  manifest jsonb,
  failure_note text
);
alter table public.platform_producer_exports enable row level security;
revoke all on public.platform_producer_exports from public,anon,authenticated;
grant select on public.platform_producer_exports to authenticated;
create policy verified_owner_exports on public.platform_producer_exports for select to authenticated using(public.is_platform_owner());
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('platform-exports','platform-exports',false,104857600,array['application/zip']);
create policy verified_owner_export_files on storage.objects for all to authenticated
using(bucket_id='platform-exports' and public.is_platform_owner() and exists(select 1 from public.platform_producer_exports e where e.object_path=name))
with check(bucket_id='platform-exports' and public.is_platform_owner() and exists(select 1 from public.platform_producer_exports e where e.object_path=name));

create function public.platform_producer_export_snapshot(target_producer uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare tables jsonb:='{}'; counts jsonb:='{}'; rows jsonb; t record; columns_sql text; total bigint:=0; n bigint; excluded jsonb:='[]'; assets jsonb;
begin
  if not public.is_platform_owner() then raise exception 'Platform owner two-factor verification is required'; end if;
  if not exists(select 1 from public.producers where id=target_producer) then raise exception 'Producer not found'; end if;
  for t in select c.relname,c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace ns on ns.oid=c.relnamespace
    where ns.nspname='public' and c.relkind='r' and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=c.oid and a.attname='producer_id' and not a.attisdropped)
    order by c.relname loop
    if t.relname like 'platform\_%' escape '\' or t.relname='roping_timing_sessions' then
      excluded:=excluded||jsonb_build_array(t.relname); continue;
    end if;
    execute format('select count(*) from public.%I where producer_id=$1',t.relname) into n using target_producer;
    total:=total+n;
    if total>100000 then raise exception 'This producer exceeds the interactive export limit. Arrange a managed database export.'; end if;
    select string_agg(format('r.%I',a.attname),',' order by a.attnum) into columns_sql from pg_catalog.pg_attribute a
      where a.attrelid=t.oid and a.attnum>0 and not a.attisdropped and a.attname !~ '(token|secret|password|session_id|email_attempt)';
    execute format('select coalesce(jsonb_agg(to_jsonb(x)),''[]''::jsonb) from (select %s from public.%I r where producer_id=$1) x',columns_sql,t.relname) into rows using target_producer;
    tables:=tables||jsonb_build_object(t.relname,rows); counts:=counts||jsonb_build_object(t.relname,n);
    if octet_length(tables::text)>26214400 then raise exception 'Record data exceeds the interactive export limit. Arrange a managed database export.'; end if;
  end loop;
  select coalesce(jsonb_agg(to_jsonb(p)-'auth_user_id'),'[]') into rows from public.ropers p where exists(select 1 from jsonb_each(tables) t cross join lateral jsonb_array_elements(t.value) r where r.value->>'roper_id'=p.id::text);
  tables:=tables||jsonb_build_object('ropers',rows); counts:=counts||jsonb_build_object('ropers',jsonb_array_length(rows));
  select coalesce(jsonb_agg(to_jsonb(r)-'payload_hash'),'[]') into rows from public.member_import_rows r join public.member_import_batches b on b.id=r.batch_id where b.producer_id=target_producer;
  tables:=tables||jsonb_build_object('member_import_rows',rows); counts:=counts||jsonb_build_object('member_import_rows',jsonb_array_length(rows));
  select jsonb_build_array(to_jsonb(p)) into rows from public.producers p where id=target_producer;
  tables:=tables||jsonb_build_object('producers',rows); counts:=counts||jsonb_build_object('producers',1);
  if octet_length(tables::text)>26214400 or (select sum(value::bigint) from jsonb_each_text(counts))>100000 then raise exception 'This producer exceeds the interactive export limit. Arrange a managed database export.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('bucket',o.bucket_id,'path',o.name,'size',o.metadata->'size')),'[]') into assets from storage.objects o
    where o.bucket_id in ('organization-logos','sponsor-logos') and split_part(o.name,'/',1)=target_producer::text;
  return jsonb_build_object('version',1,'producer_id',target_producer,'snapshot_at',statement_timestamp(),'tables',tables,'counts',counts,'assets',assets,
    'exclusions',excluded||jsonb_build_array('auth credentials','platform private notes and history','notification read state','membership claim tokens','run submission retry receipts'),
    'redacted_fields','Authentication links, token/secret/password/session fields and email delivery attempt fields are excluded. External flyer URLs are references only.');
end $$;
revoke all on function public.platform_producer_export_snapshot(uuid) from public,anon;
grant execute on function public.platform_producer_export_snapshot(uuid) to authenticated;

create function public.start_platform_producer_export(target_producer uuid,export_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare export_id uuid:=gen_random_uuid(); snapshot jsonb; path text;
begin
  if not public.is_platform_owner() then raise exception 'Platform owner two-factor verification is required'; end if;
  if length(trim(coalesce(export_reason,''))) not between 5 and 1000 then raise exception 'Explain the reason for the export'; end if;
  perform 1 from public.platform_producer_accounts where producer_id=target_producer for update;
  if not found then raise exception 'Producer account not found'; end if;
  if exists(select 1 from public.platform_producer_exports where producer_id=target_producer and status='generating' and created_at>now()-interval '10 minutes') then raise exception 'An export is already being prepared. Try again later.'; end if;
  update public.platform_producer_exports set status='failed',failure_note='Preparation timed out' where producer_id=target_producer and status='generating';
  snapshot:=public.platform_producer_export_snapshot(target_producer);
  path:=target_producer::text||'/'||export_id::text||'.zip';
  insert into public.platform_producer_exports(id,producer_id,requested_by,reason,object_path) values(export_id,target_producer,auth.uid(),trim(export_reason),path);
  insert into public.platform_account_history(producer_id,actor_user_id,action,reason,details) values(target_producer,auth.uid(),'Producer export requested',trim(export_reason),jsonb_build_object('export_id',export_id));
  return jsonb_build_object('id',export_id,'object_path',path,'snapshot',snapshot);
end $$;
revoke all on function public.start_platform_producer_export(uuid,text) from public,anon;
grant execute on function public.start_platform_producer_export(uuid,text) to authenticated;

create function public.finish_platform_producer_export(target_export uuid,export_success boolean,export_bytes bigint default null,export_hash text default null,export_manifest jsonb default null) returns void
language plpgsql security definer set search_path='' as $$
declare e public.platform_producer_exports%rowtype;
begin
  if not public.is_platform_owner() then raise exception 'Platform owner two-factor verification is required'; end if;
  select * into e from public.platform_producer_exports where id=target_export for update;
  if e.id is null or e.status<>'generating' then raise exception 'Export is not being prepared'; end if;
  if export_success and (export_bytes is null or export_bytes not between 1 and 104857600 or export_hash is null or export_hash !~ '^[0-9a-f]{64}$' or not exists(select 1 from storage.objects where bucket_id='platform-exports' and name=e.object_path)) then raise exception 'A stored archive and valid checksum are required'; end if;
  update public.platform_producer_exports set status=case when export_success then 'ready' else 'failed' end,completed_at=now(),byte_count=export_bytes,sha256=export_hash,manifest=export_manifest,failure_note=case when export_success then null else 'Export failed; retry required' end where id=e.id;
  insert into public.platform_account_history(producer_id,actor_user_id,action,reason,details) values(e.producer_id,auth.uid(),case when export_success then 'Producer export prepared' else 'Producer export failed' end,e.reason,jsonb_build_object('export_id',e.id,'bytes',export_bytes));
end $$;
revoke all on function public.finish_platform_producer_export(uuid,boolean,bigint,text,jsonb) from public,anon;
grant execute on function public.finish_platform_producer_export(uuid,boolean,bigint,text,jsonb) to authenticated;

alter function public.manage_platform_producer(uuid,text,jsonb) rename to manage_platform_producer_internal;
revoke all on function public.manage_platform_producer_internal(uuid,text,jsonb) from public,anon,authenticated;
create function public.manage_platform_producer(target_producer uuid,operation text,payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare prior_status text; hidden_count integer:=0;
begin
  if not public.is_platform_owner() then raise exception 'Platform owner two-factor verification is required'; end if;
  select status into prior_status from public.platform_producer_accounts where producer_id=target_producer for update;
  perform public.manage_platform_producer_internal(target_producer,operation,payload);
  if operation='account' and payload->>'status'='archived' and prior_status<>'archived' then
    if not (payload ? 'archiveHideEvents') then raise exception 'Choose whether published events remain public when archiving'; end if;
    if (payload->>'archiveHideEvents')::boolean then
      update public.events set publication_state='unpublished',is_public=false where producer_id=target_producer and (publication_state='published' or is_public);
      get diagnostics hidden_count=row_count;
    end if;
    insert into public.platform_account_history(producer_id,actor_user_id,action,reason,details) values(target_producer,auth.uid(),'Archive visibility recorded',payload->>'reason',jsonb_build_object('published_events_hidden',(payload->>'archiveHideEvents')::boolean,'event_count',hidden_count,'public_info_retained',true));
  end if;
end $$;
revoke all on function public.manage_platform_producer(uuid,text,jsonb) from public,anon;
grant execute on function public.manage_platform_producer(uuid,text,jsonb) to authenticated;
