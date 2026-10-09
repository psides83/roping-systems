-- Read-only checks against retained test records; no member data is changed.
begin;
select set_config('request.jwt.claims', (select jsonb_build_object('sub',user_id,'role','authenticated')::text
  from public.producer_staff where role='owner' order by created_at,user_id limit 1), true);
set local role authenticated;
do $$
declare member public.memberships; event uuid;
begin
  select * into member from public.memberships where public.can_manage_organization(producer_id) order by id limit 1;
  if member.id is null then raise exception 'Activity test requires an owner and member fixture'; end if;
  perform h.id,h.assigned_by,h.previous_assignment_id,c.name,d.name from public.membership_classification_history h
    join public.classifications c on c.id=h.classification_id join public.divisions d on d.id=h.division_id
    where h.producer_id=member.producer_id and h.membership_id=member.id;
  perform id,actor_user_id,before_data,after_data from public.producer_audit_log
    where producer_id=member.producer_id and entity_type='roping_entries'
      and (before_data->>'roper_id'=member.roper_id::text or after_data->>'roper_id'=member.roper_id::text);
  perform e.id,r.raw_time_seconds,r.penalty_seconds,r.is_excluded from public.roping_entries e
    left join public.competition_runs r on r.entry_id=e.id
    where e.producer_id=member.producer_id and e.roper_id=member.roper_id;
  perform id,title,amount_cents from public.entry_charges where producer_id=member.producer_id and roper_id=member.roper_id;
  perform user_id,display_name,email from public.producer_staff_directory where producer_id=member.producer_id;
  perform p.id,p.amount_cents from public.membership_dues d join public.membership_dues_payments p on p.dues_id=d.id
    where d.producer_id=member.producer_id and d.membership_id=member.id;
  perform p.id,a.amount_cents from public.payout_receipts p left join public.payout_receipt_awards a on a.receipt_id=p.id
    where p.producer_id=member.producer_id and p.roper_id=member.roper_id;
  select event_id into event from public.roping_entries where producer_id=member.producer_id and roper_id=member.roper_id order by id limit 1;
  if event is not null then perform entry_id,pool_name,payout_cents from public.event_payout_register_awards(event) where roper_id=member.roper_id; end if;
end $$;
reset role;
rollback;
