do $$
declare source text; updated text;
begin
  source := pg_get_functiondef('public.create_walk_up_entries(uuid,jsonb,uuid,jsonb,public.payment_status,boolean,text)'::regprocedure);
  updated := replace(source,
    '    if public.requires_membership(producer) then raise exception ''Guest entries are not available when memberships are required''; end if;',
    '    if coalesce(guest_details->>''membershipApproval'',''pending'') not in (''pending'',''approved'') then raise exception ''Choose a valid membership approval status''; end if;
    if guest_details->>''membershipApproval''=''approved'' then
      if not public.requires_membership(producer) or not public.can_manage_organization(producer) then
        raise exception ''Membership-management access is required to approve a paper application'';
      end if;
      if waitlisted then raise exception ''Approve the membership from the roper record when waitlisting''; end if;
    end if;');
  if updated=source then raise exception 'Walk-up membership guard changed'; end if;
  source := updated;
  updated := replace(source,'and (target_roper is not null or allow_non_members)', '');
  if updated=source then raise exception 'Walk-up roping selection guard changed'; end if;
  source := updated;
  updated := replace(source,'  return total;',
    '  if target_roper is null and guest_details->>''membershipApproval''=''approved'' then
    perform public.approve_walk_up_paper_membership(producer,roper,target_event);
  end if;
  return total;');
  if updated=source then raise exception 'Walk-up return statement changed'; end if;
  execute updated;
end $$;

create function public.approve_walk_up_paper_membership(target_producer uuid,target_roper uuid,target_event uuid)
returns void language plpgsql security definer set search_path='' as $$
declare member public.memberships%rowtype; prior jsonb;
begin
  if not public.can_manage_organization(target_producer) then raise exception 'Membership-management access is required'; end if;
  select * into member from public.memberships where producer_id=target_producer and roper_id=target_roper for update;
  if member.id is null or member.status not in ('pending','active')
    or (member.expires_on is not null and member.expires_on<current_date) then
    raise exception 'Review this existing membership record before approving it';
  end if;
  prior:=to_jsonb(member);
  update public.memberships set status='active' where id=member.id returning * into member;
  insert into public.producer_audit_log(producer_id,actor_user_id,entity_type,entity_id,action,before_data,after_data)
    values(target_producer,auth.uid(),'memberships',member.id,'update',prior,
      to_jsonb(member)||jsonb_build_object('paper_application_approved',true,'event_id',target_event,
        'approval_note','Paper membership application reviewed and approved at the event office'));
end $$;
revoke all on function public.approve_walk_up_paper_membership(uuid,uuid,uuid) from public,anon,authenticated;
