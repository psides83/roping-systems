alter table public.producer_staff_invitations
  add column email_status text not null default 'not_sent' check(email_status in ('not_sent','sending','sent','failed')),
  add column email_attempt_id uuid,
  add column email_attempts integer not null default 0,
  add column email_attempted_at timestamptz,
  add column email_sent_at timestamptz;

create function public.prepare_staff_invitation_email(target_invitation uuid)
returns table(attempt_id uuid,email text,producer_name text,staff_role text,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare invitation public.producer_staff_invitations%rowtype; actor_role text; attempt uuid:=gen_random_uuid();
begin
  select * into invitation from public.producer_staff_invitations where id=target_invitation for update;
  select role::text into actor_role from public.producer_staff where producer_id=invitation.producer_id and user_id=auth.uid();
  if not public.is_platform_owner() and (actor_role is null or actor_role not in ('owner','admin')) then raise exception 'Staff management requires an owner or administrator.'; end if;
  if actor_role='admin' and invitation.role in ('owner','admin') then raise exception 'Administrators may manage only lower-level staff.'; end if;
  if invitation.id is null or invitation.accepted_at is not null or invitation.cancelled_at is not null or invitation.expires_at<=now() then raise exception 'Invitation is no longer active.'; end if;
  if invitation.email_attempted_at>now()-interval '60 seconds' then raise exception 'Please wait a minute before sending again.'; end if;
  if invitation.email_attempts>=5 then raise exception 'Email attempt limit reached. Cancel this invitation and create a new one.'; end if;
  update public.producer_staff_invitations set email_status='sending',email_attempt_id=attempt,
    email_attempts=email_attempts+1,email_attempted_at=now() where id=target_invitation;
  return query select attempt,invitation.email,p.name,invitation.role::text,invitation.expires_at
    from public.producers p where p.id=invitation.producer_id;
end;
$$;

create function public.finish_staff_invitation_email(target_invitation uuid,target_attempt uuid,sent boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  update public.producer_staff_invitations i set email_status=case when sent then 'sent' else 'failed' end,
    email_sent_at=case when sent then now() else i.email_sent_at end
    where i.id=target_invitation and i.email_attempt_id=target_attempt
      and (public.is_platform_owner() or exists(select 1 from public.producer_staff s
        where s.producer_id=i.producer_id and s.user_id=auth.uid()
          and (s.role='owner' or s.role='admin' and i.role in ('operator','viewer'))));
  if not found then raise exception 'Email attempt not found or access denied.'; end if;
end;
$$;
revoke all on function public.prepare_staff_invitation_email(uuid),public.finish_staff_invitation_email(uuid,uuid,boolean) from public,anon;
grant execute on function public.prepare_staff_invitation_email(uuid),public.finish_staff_invitation_email(uuid,uuid,boolean) to authenticated;
