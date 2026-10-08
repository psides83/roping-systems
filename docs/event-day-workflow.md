# Event-day workflow

## Entry collection

Use Entries to accept online requests, register in-person contestants, select optional pots, and collect payment. The shared event navigation keeps the entry ledger, live desk, and payout register accessible without returning to the event dashboard.

## Competition

1. Start the event. Start failures appear beside the button rather than replacing the page with an error.
2. Select a roping and round, then build its order. Save or discard custom order changes before timing.
3. Record timer readings and applicable penalties, or select a non-time outcome. Non-time outcomes do not require valid timer readings.
4. Schedule required reruns from the dedicated queue. Unresolved reruns still prevent round completion.
5. Complete the round and continue to the next round. Review and lock short-round qualifiers before recording their times.
6. Once competition is resolved, use Complete roping. Its confirmation form is prefilled with Completed; existing server-side completion safeguards remain authoritative.

Completed events, completed ropings, locked rounds, and unlocked short-round fields do not expose a new-run timing form. Corrections retain their existing permission and reason requirements.

## Results and payments

Mark results official is explicitly named and confirmed. It completes the event and publishes official results; it is not a payout acknowledgment.

On Payouts, finalize each completed roping's payouts before recording payments. Finalization and receipt recording remain separate: finalization establishes awards and fund debits, while a receipt records the amount paid and who received it. Acknowledgment records staff confirmation that the recipient received that payment; it does not collect a signature.

Payment fields are disabled while saving. Confirming a previously unconfirmed receipt asks staff to verify the recipient and amount. Reversals retain their reason and audit requirements.

## Verification

`tests/desk-workflow.test.mjs` covers timing readiness, missing entries/draws, unsaved orders, short-round locking, unresolved reruns, and completed event/roping states. Existing draw, scoring, payout, funding, permission, and receipt tests remain part of the full test suite.

Browser inspection is read-only against retained test events. This pass does not issue payments or alter their competition results.
