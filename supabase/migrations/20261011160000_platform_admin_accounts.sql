create table public.platform_producer_accounts (
  producer_id uuid primary key references public.producers(id) on delete restrict,
  status text not null default 'setup' check (status in ('pending','setup','active','suspended','archived')),
  next_action text not null default '' check (length(next_action)<=300),
  follow_up_on date,
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table public.platform_producer_contacts (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.platform_producer_accounts(producer_id),
  name text not null check (length(trim(name)) between 1 and 120),
  email text check (email is null or email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  phone text check (phone is null or phone ~ '^[0-9]{10}$'),
  responsibility text not null default 'Primary' check (length(responsibility)<=120),
  is_primary boolean not null default false,
  archived_at timestamptz,
  updated_at timestamptz not null default now(),
  check (email is not null or phone is not null)
);
create unique index platform_contact_primary on public.platform_producer_contacts(producer_id) where is_primary and archived_at is null;
create index platform_contacts_producer on public.platform_producer_contacts(producer_id);
create table public.platform_onboarding_tasks (
  producer_id uuid not null references public.platform_producer_accounts(producer_id),
  task_key text not null check (task_key in ('owner','divisions','templates','payouts','season','records','launch')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  primary key(producer_id,task_key)
);
create table public.platform_producer_notes (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.platform_producer_accounts(producer_id),
  body text not null check (length(trim(body)) between 1 and 5000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create index platform_notes_producer on public.platform_producer_notes(producer_id,created_at desc);
create table public.platform_account_history (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.platform_producer_accounts(producer_id),
  actor_user_id uuid references auth.users(id),
  action text not null,
  reason text,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index platform_history_producer on public.platform_account_history(producer_id,created_at desc);

do $$ declare t text; begin
  foreach t in array array['platform_producer_accounts','platform_producer_contacts','platform_onboarding_tasks','platform_producer_notes','platform_account_history'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('create policy platform_owner_read on public.%I for select to authenticated using(public.is_platform_owner())',t);
  end loop;
end $$;
insert into public.platform_producer_accounts(producer_id,status) select id,'active' from public.producers;
insert into public.platform_onboarding_tasks(producer_id,task_key)
  select a.producer_id,t from public.platform_producer_accounts a cross join unnest(array['owner','divisions','templates','payouts','season','records','launch']) t;

create function public.initialize_platform_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.platform_producer_accounts(producer_id) values(new.id);
  insert into public.platform_onboarding_tasks(producer_id,task_key)
    select new.id,t from unnest(array['owner','divisions','templates','payouts','season','records','launch']) t;
  insert into public.platform_account_history(producer_id,actor_user_id,action) values(new.id,auth.uid(),'Producer created');
  return new;
end $$;
revoke all on function public.initialize_platform_account() from public,anon,authenticated;
create trigger initialize_platform_account after insert on public.producers for each row execute function public.initialize_platform_account();

create function public.producer_account_available(target_producer uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.platform_producer_accounts where producer_id=target_producer and status in ('setup','active'));
$$;
revoke all on function public.producer_account_available(uuid) from public;
grant execute on function public.producer_account_available(uuid) to anon,authenticated;

-- Preserve each role's existing scope while making account availability mandatory.
do $$ declare rule record; original text; body text; begin
  for rule in select * from (values
    ('has_organization_access','target_organization_id'),
    ('can_manage_organization','target_organization_id'),
    ('can_manage_finances','target_producer'),
    ('can_manage_event','(select producer_id from public.events where id=target_event)'),
    ('can_time_event','(select producer_id from public.events where id=target_event)'),
    ('can_enter_event','(select producer_id from public.events where id=target_event)')
  ) v(name,argument) loop
    select p.prosrc,pg_get_functiondef(p.oid) into strict body,original from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=rule.name and p.pronargs=1 and p.prolang=(select oid from pg_language where lanname='sql');
    execute replace(original,body,' select public.producer_account_available('||rule.argument||') and ('||regexp_replace(trim(body),';[[:space:]]*$','')||'); ');
  end loop;
end $$;

-- RPCs with direct staff-role checks must not bypass suspension. This also covers
-- existing signed-in sessions and direct table writes, without deleting records.
create function public.guard_platform_account_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare tenant uuid;
begin
  if (auth.uid() is null and coalesce(auth.role(),'')<>'anon') or public.is_platform_owner() then return case when tg_op='DELETE' then old else new end; end if;
  tenant:=case when tg_op='DELETE' then old.producer_id else new.producer_id end;
  if not public.producer_account_available(tenant) or (tg_op='UPDATE' and not public.producer_account_available(old.producer_id)) then
    raise exception 'This producer account is not currently available. Contact platform support.';
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.guard_platform_account_write() from public,anon,authenticated;
do $$ declare t record; begin
  for t in select c.table_name from information_schema.columns c join pg_class p on p.relname=c.table_name join pg_namespace n on n.oid=p.relnamespace and n.nspname=c.table_schema
    where c.table_schema='public' and c.column_name='producer_id' and p.relkind='r' and c.table_name not like 'platform_%' loop
    execute format('create trigger guard_platform_account before insert or update or delete on public.%I for each row execute function public.guard_platform_account_write()',t.table_name);
    if t.table_name<>'producer_staff' then
      execute format('create policy available_platform_account on public.%I as restrictive for all to authenticated using(public.producer_account_available(producer_id)) with check(public.producer_account_available(producer_id))',t.table_name);
    end if;
  end loop;
end $$;
-- Keep only basic account identity available so blocked users get an explanation.
create policy staff_account_identity on public.producers for select to authenticated
using(exists(select 1 from public.producer_staff where producer_id=producers.id and user_id=auth.uid()));
create policy own_staff_identity on public.producer_staff for select to authenticated using(user_id=auth.uid());

create function public.my_producer_account_statuses() returns table(producer_id uuid,status text)
language sql stable security definer set search_path='' as $$
  select a.producer_id,a.status from public.platform_producer_accounts a join public.producer_staff s on s.producer_id=a.producer_id where s.user_id=auth.uid();
$$;
revoke all on function public.my_producer_account_statuses() from public,anon;
grant execute on function public.my_producer_account_statuses() to authenticated;

create function public.platform_producer_directory(search_text text default '',status_filter text default '',page_number integer default 1) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_platform_owner() then raise exception 'Platform owner access is required'; end if;
  if page_number is null or page_number<1 or page_number>100000 or length(search_text)>100 or status_filter not in ('','pending','setup','active','suspended','archived') then raise exception 'Invalid directory filter'; end if;
  with filtered as (
    select p.id,p.name,p.slug,p.created_at,a.status,a.next_action,a.follow_up_on,
      c.name contact_name,c.email contact_email,c.phone contact_phone,
      (select count(*) from public.platform_onboarding_tasks t where t.producer_id=p.id and t.completed_at is not null) completed_tasks
    from public.producers p join public.platform_producer_accounts a on a.producer_id=p.id
    left join public.platform_producer_contacts c on c.producer_id=p.id and c.is_primary and c.archived_at is null
    where (status_filter='' or a.status=status_filter) and (search_text='' or p.name ilike '%'||search_text||'%' or p.slug ilike '%'||search_text||'%' or exists(
      select 1 from public.platform_producer_contacts x where x.producer_id=p.id and x.archived_at is null and (x.name ilike '%'||search_text||'%' or x.email ilike '%'||search_text||'%')))
  ) select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from filtered order by name,id limit 25 offset (page_number-1)*25) r),'[]'),
    'counts',(select jsonb_object_agg(status,total) from (select status,count(*) total from public.platform_producer_accounts group by status) counts)) into result;
  return result;
end $$;
revoke all on function public.platform_producer_directory(text,text,integer) from public,anon;
grant execute on function public.platform_producer_directory(text,text,integer) to authenticated;

create function public.platform_producer_detail(target_producer uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_platform_owner() then raise exception 'Platform owner access is required'; end if;
  select jsonb_build_object('producer',jsonb_build_object('id',p.id,'name',p.name,'slug',p.slug,'timezone',p.timezone,'created_at',p.created_at,'updated_at',p.updated_at),'account',to_jsonb(a),
    'contacts',coalesce((select jsonb_agg(to_jsonb(c) order by c.is_primary desc,c.name) from public.platform_producer_contacts c where c.producer_id=p.id),'[]'),
    'tasks',coalesce((select jsonb_agg(to_jsonb(t) order by t.task_key) from public.platform_onboarding_tasks t where t.producer_id=p.id),'[]'),
    'notes',coalesce((select jsonb_agg(to_jsonb(r)) from (select n.id,n.body,n.created_at,u.email author from public.platform_producer_notes n left join auth.users u on u.id=n.created_by where n.producer_id=p.id order by n.created_at desc,n.id desc limit 100) r),'[]'),
    'history',coalesce((select jsonb_agg(to_jsonb(r)) from (select h.id,h.action,h.reason,h.details,h.created_at,u.email actor from public.platform_account_history h left join auth.users u on u.id=h.actor_user_id where h.producer_id=p.id order by h.created_at desc,h.id desc limit 100) r),'[]'),
    'staff',coalesce((select jsonb_agg(jsonb_build_object('name',nullif(trim(concat_ws(' ',u.raw_user_meta_data->>'first_name',u.raw_user_meta_data->>'last_name')),''),'email',u.email,'role',s.role)) from public.producer_staff s join auth.users u on u.id=s.user_id where s.producer_id=p.id),'[]'),
    'invitations',coalesce((select jsonb_agg(jsonb_build_object('email',i.email,'role',i.role,'expires_at',i.expires_at,'email_status',i.email_status)) from public.producer_staff_invitations i where i.producer_id=p.id and i.accepted_at is null and i.cancelled_at is null),'[]'),
    'setup',jsonb_build_object('divisions',(select count(*) from public.divisions where producer_id=p.id and is_active),'classifications',(select count(*) from public.classifications where producer_id=p.id and is_active),'templates',(select count(*) from public.roping_templates where producer_id=p.id and is_active),'payouts',(select count(*) from public.payout_schedules where producer_id=p.id and is_active),'seasons',(select count(*) from public.producer_seasons where producer_id=p.id),'members',(select count(*) from public.memberships where producer_id=p.id))
  ) into result from public.producers p join public.platform_producer_accounts a on a.producer_id=p.id where p.id=target_producer;
  return result;
end $$;
revoke all on function public.platform_producer_detail(uuid) from public,anon;
grant execute on function public.platform_producer_detail(uuid) to authenticated;

create function public.manage_platform_producer(target_producer uuid,operation text,payload jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare a public.platform_producer_accounts%rowtype; c public.platform_producer_contacts%rowtype; new_status text; reason text; summary text; detail jsonb:='{}'; p public.producers%rowtype;
begin
  if not public.is_platform_owner() then raise exception 'Platform owner access is required'; end if;
  select * into a from public.platform_producer_accounts where producer_id=target_producer for update;
  if a.producer_id is null then raise exception 'Producer account not found'; end if;
  if operation='account' then
    if a.updated_at is distinct from (payload->>'expectedUpdatedAt')::timestamptz then raise exception 'This account changed in another session. Refresh before saving.'; end if;
    if payload ? 'producerName' then
      select * into p from public.producers where id=target_producer for update;
      if p.updated_at is distinct from (payload->>'expectedProducerUpdatedAt')::timestamptz then raise exception 'Producer details changed in another session. Refresh before saving.'; end if;
      if length(trim(coalesce(payload->>'producerName',''))) not between 2 and 120 then raise exception 'Enter a producer name'; end if;
      if p.name is distinct from trim(payload->>'producerName') then update public.producers set name=trim(payload->>'producerName') where id=target_producer; end if;
    end if;
    new_status:=payload->>'status'; reason:=nullif(trim(payload->>'reason'),'');
    if new_status is null or new_status not in ('pending','setup','active','suspended','archived') or length(coalesce(payload->>'nextAction',''))>300 then raise exception 'Choose a valid account status and follow-up'; end if;
    if new_status<>a.status and (reason is null or length(reason)<5 or length(reason)>1000) then raise exception 'Explain why you are changing this account status'; end if;
    if new_status<>a.status and new_status in ('pending','suspended','archived') and not coalesce((payload->>'confirmed')::boolean,false) then raise exception 'Confirm that staff access will be blocked'; end if;
    update public.platform_producer_accounts set status=new_status,next_action=trim(coalesce(payload->>'nextAction','')),follow_up_on=nullif(payload->>'followUpOn','')::date,
      approved_at=case when new_status in ('setup','active') and a.status='pending' then now() else approved_at end,
      approved_by=case when new_status in ('setup','active') and a.status='pending' then auth.uid() else approved_by end,updated_at=clock_timestamp() where producer_id=target_producer;
    summary:=case when new_status<>a.status then 'Account status changed' else 'Account details updated' end;
    detail:=jsonb_build_object('from',a.status,'to',new_status,'next_action',payload->>'nextAction','follow_up_on',payload->>'followUpOn','previous_name',p.name,'producer_name',payload->>'producerName');
  elsif operation='contact' then
    if length(trim(coalesce(payload->>'name',''))) not between 1 and 120 or length(coalesce(payload->>'responsibility',''))>120 then raise exception 'Enter a contact name and responsibility'; end if;
    if nullif(payload->>'id','') is not null then
      select * into c from public.platform_producer_contacts where id=(payload->>'id')::uuid and producer_id=target_producer and archived_at is null;
      if c.id is null then raise exception 'Contact not found'; end if;
    end if;
    if coalesce((payload->>'isPrimary')::boolean,false) then update public.platform_producer_contacts set is_primary=false where producer_id=target_producer and is_primary; end if;
    if c.id is null then
      insert into public.platform_producer_contacts(producer_id,name,email,phone,responsibility,is_primary) values(target_producer,trim(payload->>'name'),nullif(lower(trim(payload->>'email')),''),nullif(payload->>'phone',''),trim(coalesce(payload->>'responsibility','')),coalesce((payload->>'isPrimary')::boolean,false));
      summary:='Contact added';
    else
      update public.platform_producer_contacts set name=trim(payload->>'name'),email=nullif(lower(trim(payload->>'email')),''),phone=nullif(payload->>'phone',''),responsibility=trim(coalesce(payload->>'responsibility','')),is_primary=coalesce((payload->>'isPrimary')::boolean,false),updated_at=now() where id=c.id;
      summary:='Contact updated';
    end if;
    detail:=payload- 'id';
  elsif operation='archive_contact' then
    reason:=nullif(trim(payload->>'reason'),'');
    if reason is null or length(reason)<5 then raise exception 'Explain why you are archiving this contact'; end if;
    update public.platform_producer_contacts set archived_at=now(),is_primary=false where id=(payload->>'id')::uuid and producer_id=target_producer and archived_at is null returning * into c;
    if c.id is null then raise exception 'Contact not found'; end if;
    summary:='Contact archived'; detail:=jsonb_build_object('name',c.name);
  elsif operation='task' then
    update public.platform_onboarding_tasks set completed_at=case when (payload->>'done')::boolean then now() end,completed_by=case when (payload->>'done')::boolean then auth.uid() end where producer_id=target_producer and task_key=payload->>'key';
    if not found then raise exception 'Onboarding task not found'; end if;
    summary:=case when (payload->>'done')::boolean then 'Onboarding task completed' else 'Onboarding task reopened' end; detail:=payload;
  elsif operation='note' then
    insert into public.platform_producer_notes(producer_id,body,created_by) values(target_producer,trim(payload->>'body'),auth.uid());
    summary:='Private note added';
  else raise exception 'Unknown platform account action'; end if;
  insert into public.platform_account_history(producer_id,actor_user_id,action,reason,details) values(target_producer,auth.uid(),summary,reason,detail);
end $$;
revoke all on function public.manage_platform_producer(uuid,text,jsonb) from public,anon;
grant execute on function public.manage_platform_producer(uuid,text,jsonb) to authenticated;

create function public.provision_platform_producer(producer_name text,producer_slug text,owner_email text,contact_name text,contact_phone text,initial_status text)
returns table(producer_id uuid,invitation_id uuid)
language plpgsql security definer set search_path='' as $$
declare created record;
begin
  if not public.is_platform_owner() then raise exception 'Platform owner access is required'; end if;
  if initial_status not in ('pending','setup') or initial_status is null or length(trim(coalesce(contact_name,''))) not between 1 and 120 then raise exception 'Choose a contact name and onboarding status'; end if;
  select * into created from public.provision_producer(producer_name,producer_slug,owner_email);
  update public.platform_producer_accounts set status=initial_status where platform_producer_accounts.producer_id=created.producer_id;
  perform public.manage_platform_producer(created.producer_id,'contact',jsonb_build_object('name',contact_name,'email',owner_email,'phone',contact_phone,'responsibility','Primary','isPrimary',true));
  return query select created.producer_id,created.invitation_id;
end $$;
revoke all on function public.provision_platform_producer(text,text,text,text,text,text) from public,anon;
grant execute on function public.provision_platform_producer(text,text,text,text,text,text) to authenticated;
