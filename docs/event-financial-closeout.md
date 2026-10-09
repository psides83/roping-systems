# Event Financial Closeout

Open **Financial closeout** from the event dashboard actions. Only staff with
`can_finance_event` access can load the report. The report is read-only: opening
it does not finalize payouts, record money, or change competition status.

## What It Shows

- Entry and event fee assessments, collections, waivers, and outstanding balances.
- Payment-ledger receipts separately from fee allocation totals. Entries marked
  paid without a ledger receipt are not presented as recorded cash receipts.
- Completed roping awards, finalized awards, active payout receipts, remaining
  winnings, and missing recipient acknowledgments.
- Sponsor commitments, received amounts, and each roping's pledge policy.
- Fund contribution deposits and allocation debits, net of returns, with history.

Voided entry payments and reversed payout receipts are excluded. Signed refunds
reduce recorded entry payments. Internal fund movements are never added to
contestant receipts. Fund contributions post on completion and allocation debits
post on payout finalization, following the existing ledger workflow.

## Limitations

Uncompleted ropings do not yet contribute calculated winnings. Completed but
unfinalized awards are provisional and explicitly flagged. Fee allocation totals
may differ from payment-ledger receipts because of paid flags, credits, or refunds;
the difference is shown for staff review, not silently adjusted.

This is a ledger reconciliation, not a physical cash count, audited financial
statement, or profit report. Sponsor receipts do not currently identify payment
method, and operating expenses are not captured here. All amounts show cents.

All reads are scoped to the active producer and selected event; row pagination
prevents large event reports from silently stopping at the API row limit. Failed
reads throw instead of displaying misleading zero balances.
