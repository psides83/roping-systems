create table public.producer_bulletins (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete cascade,
  draft jsonb not null,
  published jsonb,
  revision integer not null default 1,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.producer_bulletins enable row level security;
revoke all on public.producer_bulletins from public,anon,authenticated;
grant select on public.producer_bulletins to authenticated;
create policy "Administrators read rule drafts" on public.producer_bulletins for select to authenticated
using(public.can_administer_organization(producer_id));
create trigger audit_producer_bulletins after insert or update or delete on public.producer_bulletins
for each row execute function public.write_audit_log();

create function public.save_producer_bulletins(target_producer uuid,bulletin_id uuid,expected_revision integer,document jsonb,operation text)
returns integer language plpgsql security definer set search_path='' as $$
declare current_revision integer; section jsonb; child jsonb; attachment jsonb; identifiers text[]:='{}';
begin
  if not public.can_administer_organization(target_producer) then raise exception 'Only an owner or administrator can manage public bulletin'; end if;
  if operation is null or operation not in ('save','publish','unpublish','delete') then raise exception 'Choose a bulletin action'; end if;
  perform 1 from public.producers where id=target_producer for update;
  select revision into current_revision from public.producer_bulletins where producer_id=target_producer and id=bulletin_id;
  if expected_revision is distinct from coalesce(current_revision,0) then raise exception 'Another administrator updated these bulletin. Reload before saving'; end if;
  if exists(select 1 from public.producer_bulletins where id=bulletin_id and producer_id<>target_producer) then raise exception 'Bulletin not found'; end if;
  if operation='delete' then
    delete from public.producer_bulletins where id=bulletin_id and producer_id=target_producer;
    return 0;
  end if;
  if operation='publish' and coalesce(document->>'effectiveOn','')='' then raise exception 'Choose a bulletin date'; end if;
  if operation='unpublish' then
    update public.producer_bulletins set published=null,published_at=null,revision=revision+1,updated_at=now() where producer_id=target_producer and id=bulletin_id returning revision into current_revision;
    return coalesce(current_revision,0);
  end if;
  if document is null or jsonb_typeof(document)<>'object' or octet_length(document::text)>1000000
    or jsonb_typeof(document->'title') is distinct from 'string' or length(document->>'title')>150
    or jsonb_typeof(document->'introduction') is distinct from 'string' or length(document->>'introduction')>20000
    or jsonb_typeof(document->'sections') is distinct from 'array'
    or jsonb_typeof(document->'attachments') is distinct from 'array' then raise exception 'Invalid bulletin document'; end if;
  if jsonb_array_length(document->'sections')>50 or jsonb_array_length(document->'attachments')>10 then raise exception 'Too many bulletin sections or documents'; end if;
  if jsonb_typeof(document->'effectiveOn') is distinct from 'string' then raise exception 'Choose an effective date'; end if;
  if document->>'effectiveOn'<>'' then
    if document->>'effectiveOn' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Choose a valid effective date'; end if;
    perform (document->>'effectiveOn')::date;
  end if;
  if operation='publish' and (length(trim(document->>'title'))=0 or jsonb_array_length(document->'sections')=0) then raise exception 'Add a title and at least one bulletin section before publishing'; end if;
  for section in select value from jsonb_array_elements(document->'sections') loop
    perform (section->>'id')::uuid;
    if section->>'id' is null or section->>'id'=any(identifiers) then raise exception 'Rule section identifiers must be unique'; end if;
    identifiers:=array_append(identifiers,section->>'id');
    if jsonb_typeof(section->'title') is distinct from 'string' or length(section->>'title')>150
      or jsonb_typeof(section->'content') is distinct from 'string' or length(section->>'content')>20000
      or jsonb_typeof(section->'subsections') is distinct from 'array' then raise exception 'Invalid rule section'; end if;
    if jsonb_array_length(section->'subsections')>30 then raise exception 'Too many subsections'; end if;
    if operation='publish' and (length(trim(section->>'title'))=0 or (length(trim(section->>'content'))=0 and jsonb_array_length(section->'subsections')=0)) then raise exception 'Complete each section before publishing'; end if;
    for child in select value from jsonb_array_elements(section->'subsections') loop
      perform (child->>'id')::uuid;
      if child->>'id' is null or child->>'id'=any(identifiers) then raise exception 'Rule section identifiers must be unique'; end if;
      identifiers:=array_append(identifiers,child->>'id');
      if jsonb_typeof(child->'title') is distinct from 'string' or length(child->>'title')>150
        or jsonb_typeof(child->'content') is distinct from 'string' or length(child->>'content')>20000 then raise exception 'Invalid subsection'; end if;
      if operation='publish' and (length(trim(child->>'title'))=0 or length(trim(child->>'content'))=0) then raise exception 'Complete each subsection before publishing'; end if;
    end loop;
  end loop;
  for attachment in select value from jsonb_array_elements(document->'attachments') loop
    perform (attachment->>'id')::uuid;
    if attachment->>'id' is null or attachment->>'id'=any(identifiers) then raise exception 'Document identifiers must be unique'; end if;
    identifiers:=array_append(identifiers,attachment->>'id');
    if jsonb_typeof(attachment->'name') is distinct from 'string' or length(trim(attachment->>'name'))=0 or length(attachment->>'name')>150
      or jsonb_typeof(attachment->'url') is distinct from 'string' or length(attachment->>'url')>2048
      or attachment->>'url' !~* '^https://[^/[:space:]@]+/[^[:space:]]*\.pdf([?#][^[:space:]]*)?$' then raise exception 'Use a named HTTPS PDF link'; end if;
  end loop;
  insert into public.producer_bulletins(id,producer_id,draft,published,published_at)
    values(bulletin_id,target_producer,document,case when operation='publish' then document end,case when operation='publish' then now() end)
  on conflict(id) do update set draft=excluded.draft,
    published=case when operation='publish' then document else producer_bulletins.published end,
    published_at=case when operation='publish' then now() else producer_bulletins.published_at end,
    revision=producer_bulletins.revision+1,updated_at=now() returning revision into current_revision;
  return current_revision;
end;
$$;
revoke all on function public.save_producer_bulletins(uuid,uuid,integer,jsonb,text) from public,anon;
grant execute on function public.save_producer_bulletins(uuid,uuid,integer,jsonb,text) to authenticated;

create function public.public_producer_bulletins(target_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('name',coalesce(p.public_name,p.name),
    'logoPath',p.logo_path,'brandPrimary',p.brand_primary,'brandAccent',p.brand_accent,
    'membershipPublished',exists(select 1 from public.membership_forms f where f.producer_id=p.id and f.publication_state='published'),
    'bulletins',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'document',b.published,'publishedAt',b.published_at)
      order by b.published->>'effectiveOn' desc,b.published_at desc,b.id)
      from public.producer_bulletins b where b.producer_id=p.id and b.published is not null),'[]'::jsonb))
  from public.producers p where p.slug=target_slug;
$$;
revoke all on function public.public_producer_bulletins(text) from public;
grant execute on function public.public_producer_bulletins(text) to anon,authenticated;
create index producer_bulletins_producer on public.producer_bulletins(producer_id);
notify pgrst,'reload schema';
