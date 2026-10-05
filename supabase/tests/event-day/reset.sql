-- Explicit opt-in, disposable fixtures only. Cleanup and reseeding share one transaction.
create temporary table reset_events(id uuid primary key) on commit drop;
insert into reset_events select id from public.events where producer_id=current_setting('test.producer_id')::uuid
  and (slug in ('test-suite-v1-weekend-1','test-suite-v1-weekend-2','test-suite-v2-weekend-1','test-suite-v2-weekend-2','test-suite-v2-live','test-suite-v2-upcoming')
    or (id='48d659d2-7e9e-4d91-8685-5c5c2f278041' and slug='test' and title='Test'));
do $$
begin
  perform set_config('app.finalizing_payouts','on',true);
  update public.event_ropings set payouts_finalized_at=null,payouts_finalized_by=null where event_id in(select id from reset_events);
  perform set_config('app.finalizing_payouts','off',true);
end $$;
delete from public.payout_receipt_awards where receipt_id in(select id from public.payout_receipts where event_id in(select id from reset_events));
delete from public.payout_receipts where event_id in(select id from reset_events);
delete from public.fund_transactions where event_roping_id in(select id from public.event_ropings where event_id in(select id from reset_events));
delete from public.roping_funding where event_roping_id in(select id from public.event_ropings where event_id in(select id from reset_events));
delete from public.member_fine_exceptions where event_roping_id in(select id from public.event_ropings where event_id in(select id from reset_events));
delete from public.entry_roping_transfers where event_id in(select id from reset_events);
delete from public.online_entry_submission_ropings where event_roping_id in(select id from public.event_ropings where event_id in(select id from reset_events));
delete from public.online_entry_submissions where event_id in(select id from reset_events);
delete from public.competition_runs where event_roping_id in(select id from public.event_ropings where event_id in(select id from reset_events));
delete from public.entry_charges where event_id in(select id from reset_events);
delete from public.roping_entries where event_id in(select id from reset_events);
delete from public.fund_transactions where event_roping_id in(select id from public.event_ropings where event_id in(select id from reset_events));
delete from public.event_fees where event_id in(select id from reset_events);
delete from public.event_ropings where event_id in(select id from reset_events);
delete from public.events where id in(select id from reset_events);
delete from public.fund_transactions where fund_id in(select id from public.producer_funds where producer_id=current_setting('test.producer_id')::uuid and name='TEST Finals General Fund') and reason like 'TEST %';
delete from public.roping_template_fees where roping_template_id in(select id from public.roping_templates where producer_id=current_setting('test.producer_id')::uuid and name like 'TEST Fund / %' and not is_active);
delete from public.roping_templates where producer_id=current_setting('test.producer_id')::uuid and name like 'TEST Fund / %' and not is_active;
delete from public.producer_funds where producer_id=current_setting('test.producer_id')::uuid and name like 'TEST %' and name<>'TEST Finals General Fund';
insert into test_report(scenario,detail) select 'Previous test events cleared',jsonb_build_object('events',count(*),'membersRetained',true) from reset_events;
