-- Only the authenticated roper's linked records are returned.
create function public.my_roper_portal()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('memberships', coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'memberNumber', m.member_number, 'status', m.status,
    'expiresOn', m.expires_on, 'producerName', p.name, 'producerSlug', p.slug,
    'today', (now() at time zone p.timezone)::date, 'entryLabelStyle', p.entry_label_style,
    'classifications', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'division', d.name) order by d.name)
      from public.membership_classification_history h join public.classifications c on c.id=h.classification_id
      join public.divisions d on d.id=h.division_id
      where h.membership_id=m.id and h.producer_id=m.producer_id
        and h.effective_on <= (now() at time zone p.timezone)::date
        and (h.ended_on is null or h.ended_on > (now() at time zone p.timezone)::date)), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(jsonb_build_object(
      'id', e.id, 'number', e.entry_number, 'paymentStatus', e.payment_status,
      'competitionStatus', e.competition_status, 'ropingId', r.id,
      'ropingName', r.name, 'division', d.name, 'date', r.scheduled_date,
      'eventTitle', v.title, 'eventSlug', v.slug, 'public', v.is_public,
      'status', r.event_day_status, 'resultStatus', r.result_status
    ) order by r.scheduled_date desc, e.entered_at desc)
      from public.roping_entries e join public.event_ropings r on r.id=e.event_roping_id and r.producer_id=m.producer_id
      join public.events v on v.id=e.event_id and v.producer_id=m.producer_id
      left join public.divisions d on d.id=r.division_id
      where e.roper_id=m.roper_id and e.producer_id=m.producer_id), '[]'::jsonb)
  ) order by p.name, m.id), '[]'::jsonb))
  from public.memberships m join public.ropers person on person.id=m.roper_id
  join public.producers p on p.id=m.producer_id where person.auth_user_id=auth.uid();
$$;
revoke all on function public.my_roper_portal() from public, anon;
grant execute on function public.my_roper_portal() to authenticated;
