alter table public.online_entry_submissions
  add column submitted_by uuid references auth.users(id) on delete set null,
  add column revision integer not null default 1 check(revision>0),
  add column withdrawn_at timestamptz;

-- Existing anonymous requests are not claimed merely by matching contact details.
alter table public.online_entry_submissions alter column submitted_by set default auth.uid();

create function public.owns_online_entry_submission(target_submission_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.online_entry_submissions s where s.id=target_submission_id
      and (s.submitted_by=auth.uid() or s.membership_id is not null and public.owns_membership(s.membership_id))
  );
$$;
revoke all on function public.owns_online_entry_submission(uuid) from public,anon;
grant execute on function public.owns_online_entry_submission(uuid) to authenticated;

create function public.advance_online_entry_revision() returns trigger language plpgsql set search_path='' as $$
begin
  new.revision:=old.revision+1;
  return new;
end; $$;
revoke all on function public.advance_online_entry_revision() from public,anon,authenticated;
create trigger advance_online_entry_revision before update on public.online_entry_submissions for each row execute function public.advance_online_entry_revision();

create table public.online_entry_submission_changes (
  id uuid primary key default gen_random_uuid(),
  producer_id uuid not null references public.producers(id) on delete cascade,
  submission_id uuid not null references public.online_entry_submissions(id) on delete cascade,
  action text not null check(action in ('edited','withdrawn')),
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  previous_selection jsonb not null,
  new_selection jsonb not null
);
alter table public.online_entry_submission_changes enable row level security;
grant select on public.online_entry_submission_changes to authenticated;
create policy "Owners and staff read submission changes" on public.online_entry_submission_changes for select to authenticated
using(public.owns_online_entry_submission(submission_id) or public.has_organization_access(producer_id));
create trigger audit_online_entry_submission_changes after insert on public.online_entry_submission_changes for each row execute function public.write_audit_log();

create function public.online_entry_selection(target_submission_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('note',s.contestant_note,'items',coalesce((select jsonb_agg(jsonb_build_object(
    'divisionId',i.event_roping_id,'quantity',i.quantity,'optionIds',coalesce((select jsonb_agg(o.event_fee_id order by o.event_fee_id)
      from public.online_entry_submission_fee_options o where o.submission_roping_id=i.id and o.producer_id=s.producer_id),'[]'::jsonb)
  ) order by i.event_roping_id) from public.online_entry_submission_ropings i where i.submission_id=s.id and i.producer_id=s.producer_id),'[]'::jsonb))
  from public.online_entry_submissions s where s.id=target_submission_id;
$$;
revoke all on function public.online_entry_selection(uuid) from public,anon,authenticated;

create function public.online_entry_change_window(target_submission_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce((select s.status='pending' and e.status not in ('entries_closed','in_progress','completed','cancelled')
    and (e.entries_open_at is null or e.entries_open_at<=now())
    and coalesce(e.entries_close_at,e.starts_at)>now()
    and not exists(select 1 from public.online_entry_submission_ropings i join public.event_ropings r on r.id=i.event_roping_id
      where i.submission_id=s.id and r.event_day_status in ('in_progress','completed'))
    from public.online_entry_submissions s join public.events e on e.id=s.event_id and e.producer_id=s.producer_id
    where s.id=target_submission_id),false);
$$;
revoke all on function public.online_entry_change_window(uuid) from public,anon,authenticated;

create function public.update_my_online_entry(target_submission_id uuid,expected_revision integer,requested_ropings jsonb,contestant_note text)
returns void language plpgsql security definer set search_path='' as $$
declare submission public.online_entry_submissions%rowtype; event public.events%rowtype; roping public.event_ropings%rowtype;
  requested jsonb; option_id jsonb; quantity integer; allowance integer; member_valid boolean;
  item_id uuid; before_selection jsonb;
begin
  select * into submission from public.online_entry_submissions where id=target_submission_id for update;
  if submission.id is null or not public.owns_online_entry_submission(submission.id) then raise exception 'This entry request is not linked to your account'; end if;
  if submission.revision is distinct from expected_revision then raise exception 'This request changed. Reload it before saving'; end if;
  select * into event from public.events where id=submission.event_id and producer_id=submission.producer_id for share;
  perform 1 from public.event_ropings where event_id=event.id order by id for update;
  if not public.online_entry_change_window(submission.id) then raise exception 'Changes are closed for this request. Contact the producer'; end if;
  if event.publication_state<>'published' then raise exception 'Online entries are not available for this event'; end if;
  if jsonb_typeof(requested_ropings) is distinct from 'array' or jsonb_array_length(requested_ropings) not between 1 and 100 then raise exception 'Select at least one roping (up to 100)'; end if;
  if length(coalesce(contestant_note,''))>500 then raise exception 'Keep the note under 500 characters'; end if;
  if (select count(*) from jsonb_array_elements(requested_ropings))<>(select count(distinct item->>'divisionId') from jsonb_array_elements(requested_ropings) item) then raise exception 'A roping may be selected only once'; end if;
  select exists(select 1 from public.memberships m where m.id=submission.membership_id and m.producer_id=submission.producer_id
    and m.roper_id=submission.roper_id and m.status='active' and (m.expires_on is null or m.expires_on>=((now() at time zone (select timezone from public.producers where id=submission.producer_id))::date))) into member_valid;
  before_selection:=public.online_entry_selection(submission.id);
  for requested in select value from jsonb_array_elements(requested_ropings) loop
    select * into roping from public.event_ropings where id=(requested->>'divisionId')::uuid and event_id=event.id and producer_id=submission.producer_id;
    if roping.id is null or roping.event_day_status in ('in_progress','completed') then raise exception 'A selected roping is unavailable or has already started'; end if;
    quantity:=(requested->>'quantity')::integer;
    if quantity is null or quantity not between 1 and 1000 then raise exception 'Choose a valid entry count (1 to 1000)'; end if;
    allowance:=public.roping_entry_allowance(roping.id,submission.roper_id);
    if allowance is not null and quantity+(select count(*) from public.roping_entries where event_roping_id=roping.id and roper_id=submission.roper_id and competition_status='active')>allowance then raise exception 'The requested entry count exceeds the roping allowance'; end if;
    if not member_valid and (not roping.allow_non_members or not (select allow_non_member_entries from public.producers where id=submission.producer_id)) then raise exception 'An active membership is required for this roping'; end if;
    if submission.birth_date is null and exists(select 1 from public.classifications c where c.id=roping.classification_id and c.eligibility_type='age') then raise exception 'A birth date is required for age-limited ropings. Contact the producer to correct your contestant details'; end if;
    if jsonb_typeof(coalesce(requested->'optionIds','[]'::jsonb)) is distinct from 'array' then raise exception 'Invalid entry options'; end if;
    if (select count(*) from jsonb_array_elements(coalesce(requested->'optionIds','[]'::jsonb)))<>(select count(distinct value) from jsonb_array_elements(coalesce(requested->'optionIds','[]'::jsonb))) then raise exception 'An option may be selected only once per roping'; end if;
    for option_id in select value from jsonb_array_elements(coalesce(requested->'optionIds','[]'::jsonb)) loop
      if not exists(select 1 from public.event_fees f where f.id=(option_id#>>'{}')::uuid and f.event_id=event.id and f.producer_id=submission.producer_id and not f.is_required and (f.event_roping_id is null or f.event_roping_id=roping.id)) then raise exception 'A selected optional fee is unavailable'; end if;
    end loop;
  end loop;
  delete from public.online_entry_submission_ropings where submission_id=submission.id;
  for requested in select value from jsonb_array_elements(requested_ropings) loop
    insert into public.online_entry_submission_ropings(producer_id,submission_id,event_roping_id,quantity)
    values(submission.producer_id,submission.id,(requested->>'divisionId')::uuid,(requested->>'quantity')::integer) returning id into item_id;
    for option_id in select value from jsonb_array_elements(coalesce(requested->'optionIds','[]'::jsonb)) loop
      insert into public.online_entry_submission_fee_options(producer_id,submission_roping_id,event_fee_id)
      values(submission.producer_id,item_id,(option_id#>>'{}')::uuid);
    end loop;
  end loop;
  update public.online_entry_submissions set contestant_note=nullif(trim(update_my_online_entry.contestant_note),'') where id=submission.id;
  insert into public.online_entry_submission_changes(producer_id,submission_id,action,changed_by,previous_selection,new_selection)
    values(submission.producer_id,submission.id,'edited',auth.uid(),before_selection,public.online_entry_selection(submission.id));
end; $$;
revoke all on function public.update_my_online_entry(uuid,integer,jsonb,text) from public,anon;
grant execute on function public.update_my_online_entry(uuid,integer,jsonb,text) to authenticated;

create function public.withdraw_my_online_entry(target_submission_id uuid,expected_revision integer)
returns void language plpgsql security definer set search_path='' as $$
declare submission public.online_entry_submissions%rowtype; before_selection jsonb;
begin
  select * into submission from public.online_entry_submissions where id=target_submission_id for update;
  if submission.id is null or not public.owns_online_entry_submission(submission.id) then raise exception 'This entry request is not linked to your account'; end if;
  if submission.revision is distinct from expected_revision then raise exception 'This request changed. Reload it before withdrawing'; end if;
  perform 1 from public.events where id=submission.event_id for share;
  perform 1 from public.event_ropings where event_id=submission.event_id order by id for share;
  if not public.online_entry_change_window(submission.id) then raise exception 'Changes are closed for this request. Contact the producer'; end if;
  before_selection:=public.online_entry_selection(submission.id);
  update public.online_entry_submissions set status='withdrawn',withdrawn_at=now() where id=submission.id;
  insert into public.online_entry_submission_changes(producer_id,submission_id,action,changed_by,previous_selection,new_selection)
    values(submission.producer_id,submission.id,'withdrawn',auth.uid(),before_selection,before_selection);
end; $$;
revoke all on function public.withdraw_my_online_entry(uuid,integer) from public,anon;
grant execute on function public.withdraw_my_online_entry(uuid,integer) to authenticated;

create function public.review_online_entry_at_revision(target_request_id uuid,expected_revision integer,review_decision public.entry_request_status,entered_review_note text,override_eligibility boolean)
returns integer language plpgsql security definer set search_path='' as $$
declare submission public.online_entry_submissions%rowtype;
begin
  select * into submission from public.online_entry_submissions where id=target_request_id for update;
  if submission.id is null or not public.can_enter_event(submission.event_id) then raise exception 'Entry office access is required'; end if;
  if submission.revision is distinct from expected_revision then raise exception 'The roper changed this request. Reload and review the current selections'; end if;
  if submission.status<>'pending' then raise exception 'This request is no longer pending'; end if;
  return public.review_online_entry_request_with_eligibility_override(target_request_id,review_decision,entered_review_note,override_eligibility);
end; $$;
revoke all on function public.review_online_entry_at_revision(uuid,integer,public.entry_request_status,text,boolean) from public,anon;
grant execute on function public.review_online_entry_at_revision(uuid,integer,public.entry_request_status,text,boolean) to authenticated;
