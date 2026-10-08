create table public.producer_history_batches (
  id uuid primary key,
  producer_id uuid not null references public.producers(id),
  season_id uuid not null references public.producer_seasons(id),
  kind text not null check(kind in ('standings','attendance','fund')),
  file_name text not null,
  source_note text not null check(length(trim(source_note)) between 5 and 1000),
  fingerprint text not null,
  mapping jsonb not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  reversed_at timestamptz,
  reversed_by uuid references auth.users(id),
  reversal_reason text,
  unique(id,producer_id)
);
create table public.producer_history_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  producer_id uuid not null,
  row_number integer not null check(row_number>0),
  source_reference text not null check(length(source_reference) between 1 and 200),
  effective_on date not null,
  roper_id uuid references public.ropers(id),
  class_key text,
  fund_id uuid references public.producer_funds(id),
  winnings_cents bigint not null default 0 check(winnings_cents between 0 and 2147483647),
  attendance_count integer not null default 0 check(attendance_count between 0 and 10000),
  fund_transaction_id uuid references public.fund_transactions(id),
  foreign key(batch_id,producer_id) references public.producer_history_batches(id,producer_id),
  unique(batch_id,row_number)
);
alter table public.producer_history_batches enable row level security;
alter table public.producer_history_rows enable row level security;
revoke all on public.producer_history_batches,public.producer_history_rows from anon,authenticated;
grant select on public.producer_history_batches,public.producer_history_rows to authenticated;
create policy "Staff read migration batches" on public.producer_history_batches for select to authenticated using(public.has_organization_access(producer_id));
create policy "Staff read migration rows" on public.producer_history_rows for select to authenticated using(public.has_organization_access(producer_id));
create trigger audit_history_batches after insert or update or delete on public.producer_history_batches for each row execute function public.write_audit_log();
create trigger audit_history_rows after insert or update or delete on public.producer_history_rows for each row execute function public.write_audit_log();
create index history_rows_producer on public.producer_history_rows(producer_id,batch_id);

create function public.review_producer_history(target_producer uuid,target_season uuid,target_kind text,input_rows jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare season public.producer_seasons%rowtype; item jsonb; results jsonb:='[]'; member public.memberships%rowtype;
  class_label text; fund public.producer_funds%rowtype; failure text; operation text; effective date; cents bigint; count integer;
begin
  if auth.uid() is null or (target_kind='fund' and not public.can_manage_finances(target_producer))
    or (target_kind is distinct from 'fund' and not public.can_manage_organization(target_producer)) then raise exception 'Migration management access is required'; end if;
  select * into season from public.producer_seasons where id=target_season and producer_id=target_producer;
  if not found or target_kind is null or target_kind not in ('standings','attendance','fund')
    or jsonb_typeof(input_rows) is distinct from 'array' or jsonb_array_length(input_rows) not between 1 and 500 then raise exception 'Choose a season and up to 500 rows'; end if;
  for item in select value from jsonb_array_elements(input_rows) loop
    failure:=null; operation:='import'; member:=null; fund:=null; class_label:=null;
    begin
      if (item->>'row')::integer<1 or length(trim(coalesce(item->>'reference',''))) not between 1 and 200 then raise exception 'Provide a unique source reference'; end if;
      effective:=(item->>'date')::date;
      if effective is null or effective not between season.starts_on and season.ends_on then raise exception 'Date must be within the selected season'; end if;
      cents:=coalesce((item->>'amountCents')::bigint,0); count:=coalesce((item->>'count')::integer,0);
      if cents not between 0 and 2147483647 or count not between 0 and 10000 then raise exception 'Invalid money or attendance amount'; end if;
      if target_kind='fund' then
        select * into fund from public.producer_funds where id=(item->>'target')::uuid and producer_id=target_producer and is_active;
        if not found or cents=0 or count<>0 then raise exception 'Choose an active fund and a positive opening balance'; end if;
        class_label:=fund.name;
      else
        select * into strict member from public.memberships where producer_id=target_producer and lower(trim(member_number))=lower(trim(item->>'memberNumber'));
        select c.name into class_label from public.classifications c where c.id::text=item->>'target' and c.producer_id=target_producer and c.standalone_enabled;
        if class_label is null then
          select d.name||' '||case split_part(item->>'target',':',2) when 'handicap' then 'Handicap' when 'four_d' then '4-D' end into class_label
            from public.divisions d where d.id::text=split_part(item->>'target',':',1) and d.producer_id=target_producer;
        end if;
        if class_label is null then raise exception 'Choose a standings class from this producer'; end if;
        if (target_kind='standings' and (cents=0 or count<>0)) or (target_kind='attendance' and (count=0 or cents<>0)) then raise exception 'Provide a positive value for this import type'; end if;
      end if;
      if exists(select 1 from public.producer_history_rows r join public.producer_history_batches b on b.id=r.batch_id
        where b.producer_id=target_producer and b.reversed_at is null and
        ((b.season_id=target_season and b.kind=target_kind and lower(r.source_reference)=lower(trim(item->>'reference')))
          or (target_kind='fund' and r.fund_id=fund.id))) then operation:='duplicate'; end if;
    exception when no_data_found then failure:='Member number not found. Import the member first.';
      when too_many_rows then failure:='Member number is ambiguous. Correct the member records first.';
      when others then failure:=sqlerrm;
    end;
    results:=results||jsonb_build_array(item||jsonb_build_object('operation',operation,'error',failure,'roperId',member.roper_id,
      'label',coalesce((select concat_ws(' ',r.first_name,r.last_name) from public.ropers r where r.id=member.roper_id),class_label),
      'targetLabel',class_label,'fundId',fund.id));
  end loop;
  return jsonb_build_object('rows',results,'snapshot',md5(results::text));
end;
$$;

create function public.apply_producer_history(target_producer uuid,target_season uuid,target_kind text,input_rows jsonb,
  target_batch uuid,file_name text,source_note text,column_mapping jsonb,expected_snapshot text)
returns uuid language plpgsql security definer set search_path='' as $$
declare reviewed jsonb; item jsonb; fingerprint text; existing public.producer_history_batches%rowtype; tx uuid;
begin
  -- Serialize migration approval, including duplicate checks, within one producer.
  perform pg_advisory_xact_lock(hashtextextended(target_producer::text,81));
  reviewed:=public.review_producer_history(target_producer,target_season,target_kind,input_rows);
  fingerprint:=md5(jsonb_build_array(target_season,target_kind,input_rows,file_name,source_note,column_mapping)::text);
  select * into existing from public.producer_history_batches where id=target_batch;
  if found then
    if existing.producer_id=target_producer and existing.fingerprint=fingerprint and existing.reversed_at is null then return existing.id; end if;
    raise exception 'This import reference has already been used';
  end if;
  if target_batch is null or length(trim(coalesce(file_name,''))) not between 1 and 250
    or length(trim(coalesce(source_note,''))) not between 5 and 1000 or column_mapping is null then raise exception 'Provide the spreadsheet and source description'; end if;
  if reviewed->>'snapshot' is distinct from expected_snapshot then raise exception 'The preview changed. Review the selected rows again'; end if;
  if exists(select 1 from jsonb_array_elements(reviewed->'rows') r where r->>'error' is not null or r->>'operation'<>'import') then raise exception 'Resolve errors and exclude duplicates before importing'; end if;
  if exists(select 1 from jsonb_array_elements(input_rows) r group by lower(trim(r->>'reference')) having count(*)>1)
    or exists(select 1 from jsonb_array_elements(input_rows) r group by r->>'row' having count(*)>1)
    or (target_kind='fund' and exists(select 1 from jsonb_array_elements(input_rows) r group by r->>'target' having count(*)>1)) then raise exception 'Duplicate references, rows, or opening fund balances in this spreadsheet'; end if;
  insert into public.producer_history_batches(id,producer_id,season_id,kind,file_name,source_note,fingerprint,mapping,created_by)
    values(target_batch,target_producer,target_season,target_kind,trim(file_name),trim(source_note),fingerprint,column_mapping,auth.uid());
  for item in select value from jsonb_array_elements(reviewed->'rows') loop
    tx:=null;
    if target_kind='fund' then
      tx:=public.record_fund_transaction((item->>'fundId')::uuid,gen_random_uuid(),'manual_deposit',(item->>'amountCents')::bigint,
        'Opening balance as of '||(item->>'date')||' | '||trim(source_note)||' | Import '||target_batch::text,null);
    end if;
    insert into public.producer_history_rows(batch_id,producer_id,row_number,source_reference,effective_on,roper_id,class_key,fund_id,winnings_cents,attendance_count,fund_transaction_id)
      values(target_batch,target_producer,(item->>'row')::integer,trim(item->>'reference'),(item->>'date')::date,(item->>'roperId')::uuid,
        case when target_kind<>'fund' then item->>'target' end,(item->>'fundId')::uuid,
        case when target_kind='standings' then (item->>'amountCents')::bigint else 0 end,
        case when target_kind='attendance' then (item->>'count')::integer else 0 end,tx);
  end loop;
  update public.producers set standings_revision=standings_revision+1 where id=target_producer;
  return target_batch;
end;
$$;

create function public.reverse_producer_history(target_batch uuid,reason text) returns void
language plpgsql security definer set search_path='' as $$
declare b public.producer_history_batches%rowtype; r record;
begin
  select * into b from public.producer_history_batches where id=target_batch;
  if not found or auth.uid() is null or (b.kind='fund' and not public.can_manage_finances(b.producer_id))
    or (b.kind<>'fund' and not public.can_manage_organization(b.producer_id)) then raise exception 'Migration management access is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(b.producer_id::text,81));
  select * into b from public.producer_history_batches where id=target_batch for update;
  if b.reversed_at is not null then raise exception 'This import is already reversed'; end if;
  if length(trim(coalesce(reason,''))) not between 5 and 1000 then raise exception 'Explain why the import is being reversed'; end if;
  for r in select * from public.producer_history_rows where batch_id=b.id and fund_transaction_id is not null order by fund_id loop
    if not exists(select 1 from public.fund_transactions where reverses_id=r.fund_transaction_id) then
      perform public.record_fund_transaction(r.fund_id,gen_random_uuid(),'reversal',null,'Migration reversal: '||trim(reason),r.fund_transaction_id);
    end if;
  end loop;
  update public.producer_history_batches set reversed_at=now(),reversed_by=auth.uid(),reversal_reason=trim(reason) where id=b.id;
  update public.producers set standings_revision=standings_revision+1 where id=b.producer_id;
end;
$$;

-- Keep the native standings source intact, while including moves for import-only ropers.
do $$ declare definition text; begin
  definition:=pg_get_functiondef('public.public_season_standings_source(text,uuid)'::regprocedure);
  if position('exists(select 1 from entrants e where e.roper_id=m.roper_id)' in definition)=0 then raise exception 'Standings move filter not found'; end if;
  definition:=replace(definition,'exists(select 1 from entrants e where e.roper_id=m.roper_id)',
    '(exists(select 1 from entrants e where e.roper_id=m.roper_id) or exists(select 1 from public.producer_history_rows i join public.producer_history_batches b on b.id=i.batch_id where i.roper_id=m.roper_id and b.season_id=s.id and b.reversed_at is null))');
  execute definition;
end $$;
alter function public.public_season_standings_source(text,uuid) rename to native_season_standings_source;
revoke all on function public.native_season_standings_source(text,uuid) from public,anon,authenticated;
create function public.public_season_standings_source(target_producer_slug text,target_season_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
with base as (select public.native_season_standings_source(target_producer_slug,target_season_id) as data),
 imported as (
  select i.*,m.profile_fields,r.first_name,r.last_name from public.producer_history_rows i
  join public.producer_history_batches b on b.id=i.batch_id
  join public.producers p on p.id=b.producer_id and p.slug=target_producer_slug
  join public.producer_seasons s on s.id=b.season_id and s.producer_id=p.id
  join public.ropers r on r.id=i.roper_id
  join public.memberships m on m.producer_id=p.id and m.roper_id=i.roper_id
  where b.season_id=target_season_id and b.reversed_at is null and b.kind in ('standings','attendance')
), imported_classes as (
  select distinct i.class_key as id,coalesce(c.name,case split_part(i.class_key,':',2) when 'handicap' then 'Handicap' else '4-D' end) as name,d.name as division_name
  from imported i left join public.classifications c on c.id::text=i.class_key
  join public.divisions d on d.id=coalesce(c.division_id,split_part(i.class_key,':',1)::uuid)
)
select data||jsonb_build_object(
 'contributions',data->'contributions'||coalesce((select jsonb_agg(jsonb_build_object('roperId',roper_id,'classId',class_key,
   'ropingId','import:'||id::text,'date',effective_on,'official',true,'winningsCents',winnings_cents,'attendanceCount',attendance_count,
   'entryIds','[]'::jsonb,'eventId',null,'source','migration')) from imported),'[]'::jsonb),
 'ropers',data->'ropers'||coalesce((select jsonb_agg(jsonb_build_object('roperId',roper_id,'classId',class_key,
   'name',concat_ws(' ',first_name,last_name),'city',profile_fields->>'city','state',profile_fields->>'state','handicap',null,'handicapSeconds',null))
   from (select distinct on(roper_id,class_key) * from imported i where not exists(select 1 from jsonb_array_elements(data->'ropers') n where n->>'roperId'=i.roper_id::text and n->>'classId'=i.class_key) order by roper_id,class_key,effective_on desc) x),'[]'::jsonb),
 'classes',data->'classes'||coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'divisionName',division_name))
   from imported_classes i where not exists(select 1 from jsonb_array_elements(data->'classes') n where n->>'id'=i.id)),'[]'::jsonb)
) from base;
$$;
revoke all on function public.review_producer_history(uuid,uuid,text,jsonb),public.apply_producer_history(uuid,uuid,text,jsonb,uuid,text,text,jsonb,text),public.reverse_producer_history(uuid,text) from public,anon;
grant execute on function public.review_producer_history(uuid,uuid,text,jsonb),public.apply_producer_history(uuid,uuid,text,jsonb,uuid,text,text,jsonb,text),public.reverse_producer_history(uuid,text) to authenticated;
revoke all on function public.public_season_standings_source(text,uuid) from public;
grant execute on function public.public_season_standings_source(text,uuid) to anon,authenticated;
