begin;
do $$
declare owner_id uuid; tenant uuid; invitation uuid; attempt uuid;
begin
  select id into strict owner_id from auth.users where lower(email)='psides83@hotmail.com';
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  tenant:=public.create_organization('Email test','email-test-'||gen_random_uuid()::text);
  invitation:=public.invite_producer_staff(tenant,'email-test@example.com','viewer');
  select attempt_id into strict attempt from public.prepare_staff_invitation_email(invitation);
  if not exists(select 1 from public.producer_staff_invitations where id=invitation and email_status='sending' and email_attempts=1) then raise exception 'Send attempt not recorded'; end if;
  begin
    perform public.prepare_staff_invitation_email(invitation);
    raise exception 'Rate limit bypassed';
  exception when others then if sqlerrm not like '%wait a minute%' then raise; end if; end;
  perform public.finish_staff_invitation_email(invitation,attempt,false);
  if not exists(select 1 from public.producer_staff_invitations where id=invitation and email_status='failed') then raise exception 'Failure not recorded'; end if;
  perform set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
  begin
    perform public.prepare_staff_invitation_email(invitation);
    raise exception 'Unauthorized send prepared';
  exception when others then if sqlerrm not like '%requires an owner%' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  perform public.cancel_staff_invitation(invitation);
  begin
    perform public.prepare_staff_invitation_email(invitation);
    raise exception 'Cancelled invitation sent';
  exception when others then if sqlerrm not like '%no longer active%' then raise; end if; end;
end;
$$;
rollback;
