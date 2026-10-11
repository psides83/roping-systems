create or replace function public.platform_producer_export_snapshot(target_producer uuid) returns jsonb
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
  select coalesce(jsonb_agg(to_jsonb(p)-'auth_user_id'),'[]') into rows from public.ropers p where exists(select 1 from jsonb_each(tables) export_table cross join lateral jsonb_array_elements(export_table.value) export_row where export_row.value->>'roper_id'=p.id::text);
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
