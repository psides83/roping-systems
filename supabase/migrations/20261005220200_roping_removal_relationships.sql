-- Remove operational child records with an unstarted roping. Financial ledger
-- and payout receipt relationships remain restrictive to protect their history.
alter table public.event_fees
  drop constraint roping_fee_division_same_organization,
  add constraint roping_fee_division_same_organization foreign key (event_roping_id, producer_id)
    references public.event_ropings(id, producer_id) on delete cascade;
alter table public.roping_entries
  drop constraint entry_division_same_organization,
  add constraint entry_division_same_organization foreign key (event_roping_id, producer_id)
    references public.event_ropings(id, producer_id) on delete cascade;
alter table public.competition_runs
  drop constraint run_division_same_organization,
  add constraint run_division_same_organization foreign key (event_roping_id, producer_id)
    references public.event_ropings(id, producer_id) on delete cascade,
  drop constraint run_entry_same_organization,
  add constraint run_entry_same_organization foreign key (entry_id, producer_id)
    references public.roping_entries(id, producer_id) on delete cascade;
alter table public.entry_charges
  drop constraint charge_entry_same_organization,
  add constraint charge_entry_same_organization foreign key (entry_id, producer_id)
    references public.roping_entries(id, producer_id) on delete cascade;
alter table public.online_entry_submission_ropings
  drop constraint online_entry_request_item_division_same_organization,
  add constraint online_entry_request_item_division_same_organization foreign key (event_roping_id, producer_id)
    references public.event_ropings(id, producer_id) on delete cascade;
