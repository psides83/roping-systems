create function public.my_roper_accounts(target_membership_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare member public.memberships%rowtype; result jsonb;
begin
  select m.* into member from public.memberships m join public.ropers r on r.id=m.roper_id
    where m.id=target_membership_id and r.auth_user_id=auth.uid();
  if member.id is null then raise exception 'This membership is not linked to your account'; end if;
  select jsonb_build_object(
    'timezone', (select timezone from public.producers where id=member.producer_id),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
      'id', v.id, 'title', v.title, 'startsAt', v.starts_at,
      'entries', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'competitionStatus', e.competition_status,
        'paymentStatus', e.payment_status, 'number', e.entry_number, 'name', r.name, 'division', d.name))
        from public.roping_entries e join public.event_ropings r on r.id=e.event_roping_id and r.producer_id=member.producer_id
        left join public.divisions d on d.id=r.division_id
        where e.event_id=v.id and e.producer_id=member.producer_id and e.roper_id=member.roper_id), '[]'::jsonb),
      'charges', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'entryId', c.entry_id,
        'title', c.title, 'amountCents', c.amount_cents, 'waived', c.waived_at is not null) order by c.created_at,c.id)
        from public.entry_charges c where c.event_id=v.id and c.producer_id=member.producer_id and c.roper_id=member.roper_id), '[]'::jsonb),
      'payments', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'amountCents', p.amount_cents,
        'method', p.payment_method, 'receivedAt', p.received_at, 'voided', p.voided_at is not null) order by p.received_at desc,p.id)
        from public.event_payments p where p.event_id=v.id and p.producer_id=member.producer_id and p.roper_id=member.roper_id), '[]'::jsonb)
    ) order by v.starts_at desc,v.id) from public.events v where v.producer_id=member.producer_id and (
      exists(select 1 from public.roping_entries e where e.event_id=v.id and e.roper_id=member.roper_id and e.producer_id=member.producer_id)
      or exists(select 1 from public.entry_charges c where c.event_id=v.id and c.roper_id=member.roper_id and c.producer_id=member.producer_id)
      or exists(select 1 from public.event_payments p where p.event_id=v.id and p.roper_id=member.roper_id and p.producer_id=member.producer_id)
    )), '[]'::jsonb),
    'submissions', coalesce((select jsonb_agg(jsonb_build_object(
      'id', s.id, 'status', s.status, 'submittedAt', s.created_at, 'reviewedAt', s.reviewed_at, 'eventTitle', v.title,
      'items', coalesce((select jsonb_agg(jsonb_build_object('name', r.name, 'division', d.name, 'date', r.scheduled_date, 'quantity', i.quantity) order by r.scheduled_date,r.sort_order,r.id)
        from public.online_entry_submission_ropings i join public.event_ropings r on r.id=i.event_roping_id and r.producer_id=member.producer_id
        left join public.divisions d on d.id=r.division_id where i.submission_id=s.id and i.producer_id=member.producer_id), '[]'::jsonb)
    ) order by s.created_at desc,s.id) from public.online_entry_submissions s join public.events v on v.id=s.event_id and v.producer_id=member.producer_id
      where s.producer_id=member.producer_id and (s.roper_id=member.roper_id or (s.roper_id is null and s.membership_id=member.id))), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.my_roper_accounts(uuid) from public, anon;
grant execute on function public.my_roper_accounts(uuid) to authenticated;
