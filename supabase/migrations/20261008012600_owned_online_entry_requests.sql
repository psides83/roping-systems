create function public.online_entry_submission_details(target_submission_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',s.id,'status',s.status,'revision',s.revision,'submittedAt',s.created_at,'updatedAt',s.updated_at,
    'reviewedAt',s.reviewed_at,'withdrawnAt',s.withdrawn_at,'eventTitle',e.title,'eventId',e.id,
    'producerName',coalesce(p.public_name,p.name),'producerSlug',p.slug,'eventSlug',e.slug,'timezone',p.timezone,
    'entriesCloseAt',coalesce(e.entries_close_at,e.starts_at),'canModify',public.online_entry_change_window(s.id),
    'firstName',s.first_name,'lastName',s.last_name,'email',s.email,'phone',s.phone,'birthDate',s.birth_date,
    'competitionGender',s.competition_gender,'memberNumber',s.member_number,'note',s.contestant_note,
    'items',coalesce((select jsonb_agg(jsonb_build_object(
      'id',i.event_roping_id,'name',r.name,'division',d.name,'date',r.scheduled_date,'quantity',i.quantity,
      'optionIds',coalesce((select jsonb_agg(o.event_fee_id order by o.event_fee_id) from public.online_entry_submission_fee_options o where o.submission_roping_id=i.id),'[]'::jsonb)
    ) order by r.scheduled_date,r.sort_order,r.id) from public.online_entry_submission_ropings i
      join public.event_ropings r on r.id=i.event_roping_id and r.producer_id=s.producer_id
      left join public.divisions d on d.id=r.division_id
      where i.submission_id=s.id and i.producer_id=s.producer_id),'[]'::jsonb),
    'changes',coalesce((select jsonb_agg(jsonb_build_object('action',c.action,'changedAt',c.changed_at) order by c.changed_at desc,c.id desc)
      from public.online_entry_submission_changes c where c.submission_id=s.id and c.producer_id=s.producer_id),'[]'::jsonb)
  ) from public.online_entry_submissions s
    join public.events e on e.id=s.event_id and e.producer_id=s.producer_id
    join public.producers p on p.id=s.producer_id where s.id=target_submission_id;
$$;
revoke all on function public.online_entry_submission_details(uuid) from public,anon,authenticated;

create function public.my_online_entry_submission(target_submission_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if not public.owns_online_entry_submission(target_submission_id) then raise exception 'This entry request is not linked to your account'; end if;
  return public.online_entry_submission_details(target_submission_id);
end; $$;
revoke all on function public.my_online_entry_submission(uuid) from public,anon;
grant execute on function public.my_online_entry_submission(uuid) to authenticated;

create function public.my_online_entry_submissions(target_membership_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or target_membership_id is not null and not public.owns_membership(target_membership_id) then raise exception 'Sign in with a linked account'; end if;
  return coalesce((select jsonb_agg(public.online_entry_submission_details(s.id) order by s.created_at desc,s.id)
    from public.online_entry_submissions s where public.owns_online_entry_submission(s.id)
      and (target_membership_id is null or s.membership_id=target_membership_id)),'[]'::jsonb);
end; $$;
revoke all on function public.my_online_entry_submissions(uuid) from public,anon;
grant execute on function public.my_online_entry_submissions(uuid) to authenticated;

alter function public.my_roper_accounts(uuid) rename to portal_accounts_before_entry_management;
revoke all on function public.portal_accounts_before_entry_management(uuid) from public,anon,authenticated;
create function public.my_roper_accounts(target_membership_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  result:=public.portal_accounts_before_entry_management(target_membership_id);
  return jsonb_set(result,'{submissions}',public.my_online_entry_submissions(target_membership_id));
end; $$;
revoke all on function public.my_roper_accounts(uuid) from public,anon;
grant execute on function public.my_roper_accounts(uuid) to authenticated;
