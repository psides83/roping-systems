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

## Busy-desk safeguards

The active desk selector keeps the roping, arena, and round together at the top. While a selection is loading, the previous desk is inert so staff cannot inadvertently save against the old selection. Roping operations are collapsed beneath timing; draw and round-completion controls move ahead of the draw table when action is needed.

Timing has its own component and repeats the roping/round context beside the active contestant. Enter in a timer field moves focus to the next timer or save button rather than immediately submitting. Pending saves disable editing and prevent repeated submissions. Turn outs, disqualifications, rerun requests, and replacing entered readings with No time require confirmation. A qualified zero-second reading requires explicit confirmation.

Unsaved time and order edits prompt before app/sidebar link navigation or desk-selector changes. Refreshing or closing the tab uses the browser's unsaved-work warning. Timing drafts also have device recovery as described below; custom draw edits do not.

The last recorded result is derived from the saved run timestamp, not the draw position. It identifies the contestant and entry and offers the existing reason-required correction workflow to authorized staff. Payment status adjustments are collapsed separately from cash collection and require confirmation.

## Arena assignments and timing control

Owners and administrators assign timing staff to an event under Settings > Staff > Event assignments, then select an arena or All arenas. Each timing staff member sees their assigned arena's ropings and the shared First Available waiting list. Managers retain all-arena access. Entry-office access is not restricted by timing arenas.

First Available ropings must receive an actual arena before timing. The initial desk prefers an active roping in the assigned arena; a requested roping outside the assignment cannot override that scope.

Take timing control explicitly before saving times, correcting results, or scheduling reruns. Control belongs to one browser session for one roping, across all its rounds. Another tab, even for the same account, cannot acquire it while that session is active. Different ropings can be timed simultaneously. Other staff can inspect the desk without acquiring control.

The holder renews a 90-second lease every 20 seconds. A failed check or local expiry disables saving without clearing entered readings; Supabase rechecks ownership and arena access during every write. Release control explicitly when handing off. Leaving the desk attempts a release; if a browser closes or loses its connection, the lease expires automatically. Managers can take over with confirmation and a stated reason. The changelog records claims, releases, and takeovers, but not every heartbeat or private browser-session token.

The canonical scoring and rerun workflows require the session token. Direct run/timer writes and the legacy scoring entry point are not available to signed-in clients. SQL tests in `supabase/tests/arena-timing-control.sql` exercise concurrent session claims, separate arenas, manager takeover, expiry, assignment changes, corrections, reruns, and First Available restrictions, entirely within a rollback transaction.

## Brief connection recovery

Timer readings and selected penalties are saved on each change in this browser's local storage, scoped to the signed-in staff member, event, run, and rerun attempt. Refreshing the same desk restores its draft. Device storage failures show a warning: readings then remain only in the open page. Clearing browser data or switching devices does not preserve drafts.

The desk distinguishes device drafts, saving, unconfirmed saves, and server-confirmed results. A save waits up to 15 seconds for confirmation. A timeout does not mean the server rejected the result: the original submission stays unchanged until staff retry it or check its saved status. Retries reuse a submission ID, so a committed result is acknowledged without recording it twice. Older drafts cannot replace a completed run or a newer rerun attempt.

After reconnecting, staff must regain timing control before retrying an unconfirmed result. Device drafts needing review appear above the desk with links to their rounds; Check saved status only reads server confirmation and never submits a result. There is no automatic background submission or full offline event mode. Loading the app, collecting entries, and completing rounds still require a connection. This recovery covers the main timing input, not correction dialogs or unsaved custom draws.

`tests/timer-recovery.test.mjs`, `tests/timer-draft-hook.test.mjs`, and the timing UI tests cover restoration, storage failures, transport timeouts, and immutable retries. `supabase/tests/run-submission-recovery.sql` checks duplicate receipts, stale attempts, ownership, and permissions in a rollback transaction.
