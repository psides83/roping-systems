create index if not exists platform_health_audit_lookup on public.producer_audit_log(producer_id,created_at desc);

create function public.platform_account_health(attention_filter text default '',page_number integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; today date := (now() at time zone 'America/Chicago')::date;
begin
  if not public.is_platform_owner() then raise exception 'Platform owner two-factor verification is required'; end if;
  if attention_filter is null or attention_filter not in ('','followup','approval','setup','contact','suspended')
    or page_number is null or page_number not between 1 and 100000 then raise exception 'Invalid health filter'; end if;
  with accounts as (
    select p.id,p.name,p.slug,p.timezone,a.status,a.next_action,a.follow_up_on,
      (select count(*) from public.platform_onboarding_tasks t where t.producer_id=p.id and t.completed_at is not null) reviewed,
      exists(select 1 from public.platform_producer_contacts c where c.producer_id=p.id and c.is_primary and c.archived_at is null) has_contact,
      (select max(l.created_at) from public.producer_audit_log l where l.producer_id=p.id and l.actor_user_id is not null) last_change_at
    from public.producers p join public.platform_producer_accounts a on a.producer_id=p.id where a.status<>'archived'
  ), flagged as (
    select *,status in ('pending','setup','active') and follow_up_on<=today due_followup,
      status='pending' needs_approval,status='setup' and reviewed<7 needs_setup,
      status in ('pending','setup','active') and not has_contact needs_contact
    from accounts
  ), attention as (
    select * from flagged where case attention_filter
      when 'followup' then due_followup when 'approval' then needs_approval when 'setup' then needs_setup
      when 'contact' then needs_contact when 'suspended' then status='suspended'
      else coalesce(due_followup,false) or needs_approval or needs_setup or needs_contact or status='suspended' end
  ), scheduled as (
    select e.id,e.title,e.slug,e.producer_id,p.name producer_name,p.slug producer_slug,p.timezone,
      e.starts_at,e.ends_at,e.status,e.publication_state,e.is_public
    from public.events e join public.producers p on p.id=e.producer_id
    join public.platform_producer_accounts a on a.producer_id=p.id
    where a.status in ('setup','active') and e.status not in ('draft','completed','cancelled')
      and coalesce(e.ends_at,e.starts_at)>=now() and e.starts_at<now()+interval '30 days'
  ) select jsonb_build_object(
    'today',today,'total',(select count(*) from attention),
    'counts',jsonb_build_object('followup',(select count(*) from flagged where due_followup),
      'approval',(select count(*) from flagged where needs_approval),'setup',(select count(*) from flagged where needs_setup),
      'contact',(select count(*) from flagged where needs_contact),'suspended',(select count(*) from flagged where status='suspended'),
      'events',(select count(*) from scheduled)),
    'accounts',coalesce((select jsonb_agg(to_jsonb(r)) from (
      select * from attention order by coalesce(due_followup,false) desc,follow_up_on nulls last,name,id
      limit 25 offset (page_number-1)*25) r),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(r)) from (
      select * from scheduled order by starts_at,id limit 10) r),'[]'::jsonb),
    'recent',coalesce((select jsonb_agg(to_jsonb(r)) from (
      select id,name,last_change_at from accounts where last_change_at is not null
      order by last_change_at desc,id limit 10) r),'[]'::jsonb)
  ) into result;
  return result;
end $$;
revoke all on function public.platform_account_health(text,integer) from public,anon;
grant execute on function public.platform_account_health(text,integer) to authenticated;
