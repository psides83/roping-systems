# Event-Day Print Documents

Open **Print documents** from the event workflow navigation. From the live desk,
the current roping is selected; from Entries or Payouts, the matching
document is selected. Use the document filters and **View document**, then
**Print / save PDF**. Refresh data before reprinting after changes.

## Documents

- Draw sheet: built draw positions, contestants, configured entry labels, cattle,
  and recorded run statuses. All main rounds and the short round are included in
  one document, with each round starting a new printed page. At least one round
  must have a complete order to enable printing; other rounds are explicitly
  labeled provisional when their orders or fields are not built yet.
- Timer sheet: all rounds, all configured timer columns, penalties, signed handicap
  adjustments, and final times/statuses. Previously saved readings are prefilled;
  unresolved runs provide writing space. One print/save action covers the whole
  roping, including its short round. Refresh and reprint when subsequent draws
  or short-round qualifiers become available. Old round-specific links now show
  the entire document rather than limiting it to that round.
- Contestant entry summaries: all contestants or one contestant, including each
  entered roping, entry options/charges, event-wide fees, paid amount, balance,
  and credit. Each contestant starts a new printed page. Balances use the same
  calculation as the entry office, including voids, waivers, and comped entries.
- Payout acknowledgment list: all finalized ropings or one roping, grouped by
  roper identity, with award breakdowns, paid/due amounts, existing receipt
  confirmations, and space to record verbal acknowledgment. Changed/overpaid
  awards are flagged for review.

Printing is read-only. Paper timing changes and payout acknowledgments must be
recorded in the app; printing never acquires timing control or records payment.
Each document includes a generation timestamp in the producer's timezone.

## Access

Event management, assigned timing staff, and entry collection staff can print
competition sheets. Timing staff retain their arena scope. Contestant financial
summaries require entry-collection access. Payout sheets require event-finance
access. Documents use the authenticated Supabase client and producer/event filters,
not a service-role key. Financial data is fetched only for the authorized document.

Large table queries and the award RPC are paginated to avoid Supabase's response
cap. Printed tables repeat their column headings and avoid splitting individual
run rows. Timer sheets default to landscape; other sheets default to portrait.
