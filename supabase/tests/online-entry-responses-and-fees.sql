begin;
do $$
declare staff uuid; account uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid();
  member public.memberships%rowtype; roping public.event_ropings%rowtype; request_id uuid;
  producer_slug text; event_slug text; email text; result jsonb; revision integer; expected jsonb;
begin
  select u.id into strict staff from auth.users u where lower(u.email)='psides83@hotmail.com';
  select m.* into strict member from public.memberships m where exists(select 1 from public.event_ropings r where r.producer_id=m.producer_id) order by m.id limit 1;
  select * into strict roping from public.event_ropings where producer_id=member.producer_id order by id limit 1;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (account,account::text||'@example.com',now(),'{}'),(stranger,stranger::text||'@example.com',now(),'{}');
  update public.ropers set auth_user_id=null where auth_user_id=account;
  update public.ropers set auth_user_id=account where id=member.roper_id;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  update public.events set is_public=true,publication_state='published' where id=roping.event_id;
  select slug into producer_slug from public.producers where id=member.producer_id;
  select slug into event_slug from public.events where id=roping.event_id;
  select r.email into email from public.ropers r where id=member.roper_id;
  perform set_config('request.jwt.claim.sub',account::text,true);
  result:=public.my_online_entry_fee_context(producer_slug,event_slug,member.member_number,email);
  select coalesce(jsonb_agg(distinct case when f.scope='contestant_division' then f.event_roping_id::text||':'||f.id::text else f.id::text end),'[]'::jsonb)
    into expected from public.entry_charges c join public.event_fees f on f.id=c.event_fee_id and f.producer_id=c.producer_id
    where c.event_id=roping.event_id and c.roper_id=member.roper_id and c.producer_id=member.producer_id and f.scope<>'entry';
  if result->'coveredFeeKeys'<>expected then raise exception 'Covered fees do not match existing charges'; end if;
  insert into public.online_entry_submissions(producer_id,event_id,first_name,last_name,email,membership_id,roper_id)
    values(member.producer_id,roping.event_id,'Response','Tester',email,member.id,member.roper_id) returning id into request_id;
  insert into public.online_entry_submission_ropings(producer_id,submission_id,event_roping_id,quantity)
    values(member.producer_id,request_id,roping.id,1);
  revision:=(public.my_online_entry_submission(request_id)->>'revision')::integer;
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  begin
    perform public.my_online_entry_fee_context(producer_slug,event_slug,member.member_number,email);
    raise exception 'Stranger saw balances';
  exception when raise_exception then if sqlerrm not like '%Connect this membership%' then raise; end if; end;
  begin
    perform public.review_online_entry_with_response(request_id,revision,'declined','Private test note',false,'Public test response');
    raise exception 'Unauthorized review succeeded';
  exception when raise_exception then if sqlerrm not like '%permission%' and sqlerrm not like '%access%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',staff::text,true);
  perform public.review_online_entry_with_response(request_id,revision,'declined','Private test note',false,'Public test response');
  perform set_config('request.jwt.claim.sub',account::text,true);
  result:=public.my_online_entry_submission(request_id);
  if result->>'producerResponse'<>'Public test response' or result::text like '%Private test note%' then raise exception 'Public response or staff-note privacy failed'; end if;
  if has_function_privilege('anon','public.my_online_entry_fee_context(text,text,text,text)','execute')
    or has_function_privilege('anon','public.review_online_entry_with_response(uuid,integer,public.entry_request_status,text,boolean,text)','execute') then raise exception 'Private fee/review RPC exposed'; end if;
end; $$;
rollback;
