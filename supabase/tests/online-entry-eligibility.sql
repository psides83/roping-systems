begin;
do $$
declare member public.memberships%rowtype; roping public.event_ropings%rowtype;
  account uuid:=gen_random_uuid(); stranger uuid:=gen_random_uuid(); producer_slug text; event_slug text;
  email text; result jsonb; entries_before bigint; charges_before bigint;
begin
  select m.* into strict member from public.memberships m where exists(select 1 from public.event_ropings r where r.producer_id=m.producer_id) order by m.id limit 1;
  select * into strict roping from public.event_ropings where producer_id=member.producer_id order by id limit 1;
  insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    (account,account::text||'@example.com',now(),'{}'),(stranger,stranger::text||'@example.com',now(),'{}');
  update public.ropers set auth_user_id=null where auth_user_id=account;
  update public.ropers set auth_user_id=account where id=member.roper_id;
  update public.events set is_public=true,publication_state='published',status='scheduled' where id=roping.event_id;
  select slug into producer_slug from public.producers where id=member.producer_id;
  select slug into event_slug from public.events where id=roping.event_id;
  select r.email into email from public.ropers r where id=member.roper_id;
  select count(*) into entries_before from public.roping_entries;
  select count(*) into charges_before from public.entry_charges;
  perform set_config('request.jwt.claim.sub',account::text,true);
  result:=public.my_online_entry_eligibility(producer_slug,event_slug,member.member_number,email);
  if jsonb_array_length(result)=0 or exists(select 1 from jsonb_array_elements(result) x where x->>'status' not in ('eligible','review','restricted')) then raise exception 'Missing eligibility feedback'; end if;
  if entries_before<>(select count(*) from public.roping_entries) or charges_before<>(select count(*) from public.entry_charges) then raise exception 'Preview changed competition records'; end if;
  perform set_config('request.jwt.claim.sub',stranger::text,true);
  begin
    perform public.my_online_entry_eligibility(producer_slug,event_slug,member.member_number,email);
    raise exception 'Stranger saw private eligibility';
  exception when raise_exception then if sqlerrm not like '%Connect this membership%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub','',true);
  begin
    perform public.my_online_entry_eligibility(producer_slug,event_slug,member.member_number,email);
    raise exception 'Anonymous preview succeeded';
  exception when raise_exception then if sqlerrm not like '%Sign in%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',account::text,true);
  update public.events set publication_state='unpublished' where id=roping.event_id;
  begin
    perform public.my_online_entry_eligibility(producer_slug,event_slug,member.member_number,email);
    raise exception 'Private event preview succeeded';
  exception when raise_exception then if sqlerrm not like '%not available%' then raise; end if; end;
  if has_function_privilege('anon','public.my_online_entry_eligibility(text,text,text,text)','execute')
    or has_function_privilege('authenticated','public.entry_classification_failure(public.roping_entries)','execute') then raise exception 'Private helpers exposed'; end if;
end; $$;
rollback;
