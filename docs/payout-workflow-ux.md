# Payout workflow clarity — October 15, 2026

The payout page now follows three stages in order, with direct jump links:

1. Review projections: current calculated awards, explicitly labeled as projections.
2. Finalize payouts: review funding and finalize each completed roping, locking its results and payout settings.
3. Record payments: the finalized-winnings register, payment history, and receipt acknowledgment.

Inline and optional guidance explain that finalization does not record money paid and receipt confirmation does not record another payment. The register totals are labeled Finalized winnings, Recorded paid, and Still due. Scope text identifies the roping included in totals and explains that search/status filters affect the list only. The financial calculations are unchanged.

The mobile register shows unconfirmed receipts without requiring expansion, and the payout action has a visible Record label. Touch targets are larger, filtered counts are announced, and Clear filters resets roping/search/status/expanded rows together.

Payout and reversal dialogs now use the shared native dialog for focus handling, Escape, unsaved-edit protection, and busy dismissal guards. Existing amount limits, required reversal reasons, server permissions, and stable retry references are preserved. The dialog explains that it records payments rather than transferring money.

## Validation

- All 558 tests passed, including scope/filter totals, payment permission and overpayment blocks, stable retry identity, confirmed-success dismissal, amount limits, and pending payout/reversal guards.
- ESLint, TypeScript, and production build passed.
- Desktop and 390px mobile review used the actual register with isolated sample awards and receipts in a temporary preview route. Expanded history, receipt flags, empty search, and filter recovery were checked. The temporary route was removed before building or committing.
- No real payment, receipt confirmation, reversal, or finalization was performed. Production permissions and database calculations were not changed.
- No Supabase migration is required. The financial closeout screen remains a separate follow-up pass.
