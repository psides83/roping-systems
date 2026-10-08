begin;
do $$
declare
  staff uuid; account uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid();
  r public.event_ropings%rowtype; request_id uuid; anonymous_id uuid;
  revision integer; selection jsonb; result jsonb; extra_id uuid; member public.memberships%rowtype;
  entries_before bigint;
begin
  select id into strict staff from auth.users where lower(email)='psides83@hotmail.com';
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
    values(account,'request-test-'||account::text||'@example.com',now(),'{}'),
      (stranger,'request-stranger-'||stranger::text||'@example.com',now(),'{}');
  perform set_config('request.jwt.claim.sub',staff::text,true);
  select * into strict r from public.event_ropings where event_day_status not in ('in_progress','completed') order by id limit 1;
  update public.events set status='entries_open',publication_state='published',is_public=true,
    starts_at=now()+interval '20 days',ends_at=now()+interval '21 days',
    entries_open_at=now()-interval '1 day',entries_close_at=now()+interval '10 days' where id=r.event_id;
  update public.producers set allow_non_member_entries=true where id=r.producer_id;
  update public.event_ropings set allow_non_members=true,max_entries_per_roper=3 where id=r.id;
  perform set_config('request.jwt.claim.sub',account::text,true);
  insert into public.online_entry_submissions(producer_id,event_id,first_name,last_name,email,birth_date,competition_gender)
    values(r.producer_id,r.event_id,'Request','Tester','same-contact@example.com','1990-01-01','female') returning id into request_id;
  insert into public.online_entry_submission_ropings(producer_id,submission_id,event_roping_id,quantity)
    values(r.producer_id,request_id,r.id,1);
  select count(*) into entries_before from public.roping_entries where event_id=r.event_id;
  if not public.owns_online_entry_submission(request_id) then raise exception 'Submitter ownership was not captured'; end if;
  result:=public.my_online_entry_submission(request_id);
  if result ? 'reviewNote' or result ? 'review_note' then raise exception 'Private staff note exposed'; end if;
  revision:=(result->>'revision')::integer;
  selection:=jsonb_build_array(jsonb_build_object('divisionId',r.id,'quantity',2,'optionIds','[]'::jsonb));
  perform public.update_my_online_entry(request_id,revision,selection,'Two entries please');
  result:=public.my_online_entry_submission(request_id);
  if (result->>'revision')::integer<>revision+1 or (result->'items'->0->>'quantity')::integer<>2
    or jsonb_array_length(result->'changes')<>1 then raise exception 'Edit did not preserve identity, selections and history'; end if;
  if entries_before<>(select count(*) from public.roping_entries where event_id=r.event_id) then raise exception 'Editing created confirmed entries'; end if;
  begin
    perform public.update_my_online_entry(request_id,revision,selection,'Stale edit');
    raise exception 'Stale edit succeeded';
  exception when raise_exception then if sqlerrm not like '%changed%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  begin
    perform public.review_online_entry_at_revision(request_id,revision,'declined','',false);
    raise exception 'Stale staff review succeeded';
  exception when raise_exception then if sqlerrm not like '%changed%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  begin
    perform public.my_online_entry_submission(request_id);
    raise exception 'Stranger read succeeded';
  exception when raise_exception then if sqlerrm not like '%not linked%' then raise; end if; end;
  begin
    perform public.withdraw_my_online_entry(request_id,revision+1);
    raise exception 'Stranger withdrawal succeeded';
  exception when raise_exception then if sqlerrm not like '%not linked%' then raise; end if; end;
  begin
    perform public.update_my_online_entry(request_id,revision+1,selection,'Unauthorized');
    raise exception 'Stranger edit succeeded';
  exception when raise_exception then if sqlerrm not like '%not linked%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',account::text,true);
  begin
    perform public.update_my_online_entry(request_id,revision+1,jsonb_build_array(jsonb_build_object('divisionId',r.id,'quantity',4)),'Too many');
    raise exception 'Entry allowance was bypassed';
  exception when raise_exception then if sqlerrm not like '%allowance%' then raise; end if; end;
  begin
    perform public.update_my_online_entry(request_id,revision+1,jsonb_build_array(jsonb_build_object('divisionId',r.id,'quantity',1,'optionIds',jsonb_build_array(gen_random_uuid()))),'Invalid option');
    raise exception 'Invalid optional fee succeeded';
  exception when raise_exception then if sqlerrm not like '%optional fee%' then raise; end if; end;
  begin
    perform public.update_my_online_entry(request_id,revision+1,selection||selection,'Duplicate');
    raise exception 'Duplicate roping succeeded';
  exception when raise_exception then if sqlerrm not like '%only once%' then raise; end if; end;
  update public.events set entries_close_at=now() where id=r.event_id;
  begin
    perform public.withdraw_my_online_entry(request_id,revision+1);
    raise exception 'Closed-window withdrawal succeeded';
  exception when raise_exception then if sqlerrm not like '%closed%' then raise; end if; end;
  begin
    perform public.update_my_online_entry(request_id,revision+1,selection,'Closed');
    raise exception 'Closed-window edit succeeded';
  exception when raise_exception then if sqlerrm not like '%closed%' then raise; end if; end;
  update public.events set entries_close_at=now()+interval '10 days' where id=r.event_id;
  update public.events set publication_state='unpublished' where id=r.event_id;
  if (public.my_online_entry_submission(request_id)->>'canModify')::boolean then raise exception 'Unpublished event offers broken edit controls'; end if;
  update public.events set publication_state='published' where id=r.event_id;
  update public.event_ropings set event_day_status='in_progress' where id=r.id;
  begin
    perform public.update_my_online_entry(request_id,revision+1,selection,'Started');
    raise exception 'Started roping edit succeeded';
  exception when raise_exception then if sqlerrm not like '%closed%' then raise; end if; end;
  update public.event_ropings set event_day_status='scheduled' where id=r.id;
  perform public.withdraw_my_online_entry(request_id,revision+1);
  result:=public.my_online_entry_submission(request_id);
  if result->>'status'<>'withdrawn' or jsonb_array_length(result->'items')<>1 or jsonb_array_length(result->'changes')<>2
    or (result->>'canModify')::boolean then raise exception 'Withdrawal did not preserve read-only history'; end if;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  begin
    perform public.review_online_entry_at_revision(request_id,revision+2,'accepted','',false);
    raise exception 'Withdrawn request accepted';
  exception when raise_exception then if sqlerrm not like '%no longer pending%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub','',true);
  insert into public.online_entry_submissions(producer_id,event_id,first_name,last_name,email)
    values(r.producer_id,r.event_id,'Anonymous','Tester','same-contact@example.com') returning id into anonymous_id;
  perform set_config('request.jwt.claim.sub',account::text,true);
  if public.owns_online_entry_submission(anonymous_id) then raise exception 'Matching contact details granted ownership'; end if;
  if jsonb_array_length(public.my_online_entry_submissions())<>1 then raise exception 'Account request list exposed another submitter'; end if;
  extra_id:=public.submit_online_entry_request_v3((select slug from public.producers where id=r.producer_id),
    (select slug from public.events where id=r.event_id),'Online','Tester',account::text||'@example.com','',
    '1990-01-01','female','','Test request',jsonb_build_array(jsonb_build_object('divisionId',r.id,'quantity',1,'optionIds','[]'::jsonb)));
  if not public.owns_online_entry_submission(extra_id) then raise exception 'Actual public submission did not capture its signed-in owner'; end if;
  revision:=(public.my_online_entry_submission(extra_id)->>'revision')::integer;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  perform public.review_online_entry_at_revision(extra_id,revision,'declined','Private office-only explanation',false);
  perform set_config('request.jwt.claim.sub',account::text,true);
  if public.my_online_entry_submission(extra_id)::text like '%Private office-only%' then raise exception 'Office note leaked to roper'; end if;
  begin
    perform public.update_my_online_entry(extra_id,revision+1,selection,'Declined');
    raise exception 'Declined request edit succeeded';
  exception when raise_exception then if sqlerrm not like '%closed%' then raise; end if; end;
  update public.online_entry_submissions set status='accepted' where id=extra_id;
  begin
    perform public.withdraw_my_online_entry(extra_id,revision+2);
    raise exception 'Accepted request withdrawal succeeded';
  exception when raise_exception then if sqlerrm not like '%closed%' then raise; end if; end;
  select * into strict member from public.memberships where producer_id=r.producer_id order by id limit 1;
  update public.ropers set auth_user_id=null where auth_user_id=account;
  update public.ropers set auth_user_id=account where id=member.roper_id;
  update public.online_entry_submissions set membership_id=member.id,roper_id=member.roper_id where id=anonymous_id;
  if not public.owns_online_entry_submission(anonymous_id) then raise exception 'Verified membership does not own its original anonymous request'; end if;
  result:=public.my_roper_accounts(member.id);
  if jsonb_array_length(result->'submissions')<>1 then raise exception 'Membership portal request reader is not compatible'; end if;
  if has_function_privilege('anon','public.update_my_online_entry(uuid,integer,jsonb,text)','EXECUTE')
    or has_function_privilege('anon','public.withdraw_my_online_entry(uuid,integer)','EXECUTE')
    or has_function_privilege('authenticated','public.online_entry_submission_details(uuid)','EXECUTE') then raise exception 'Private request helpers exposed'; end if;
end;
$$;
rollback;
