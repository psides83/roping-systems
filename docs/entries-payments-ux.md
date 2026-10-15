# Entries and payments usability — October 15, 2026

The entry ledger now presents each contestant as a readable group on phones and tablets, while retaining the desktop table. It renders one set of controls, preserving existing permission checks and entry actions. Arrival, payment status, balance due, ropings, and charges have visible mobile labels. Filtered counts are announced, the search has an accessible name, and Clear filters restores search/payment/arrival filters together.

Pending online requests are explicitly described as not yet entered. Contextual guidance explains request acceptance, check-in, cash receipts, and payment-status adjustments. The ledger is labeled Entries & payments and explains which records appear there.

The existing balance calculation can treat a paid-cash status as paid even without a non-void receipt. The UI now says **Marked paid · No cash receipt recorded** for that case, rather than describing it as money received. The summary says **Paid / marked paid**, and zero balances say **No balance due** to accommodate comped or otherwise adjusted records. Financial calculations and server actions have not changed.

Cash payments now use the shared native dialog for focus, Escape, and unsaved-edit protection. Recording or voiding a payment blocks dismissal and other financial controls while pending. A completed/unmounted void form clears its busy state. The amount's existing balance limit and void correction reason remain required. Receipt links identify that they open a new tab.

## Validation

- All 554 application tests passed, including combined filter/reset behavior, marked-paid versus receipt-backed labels, balance limits, and recording/voiding pending guards.
- ESLint, TypeScript, and production build passed.
- Read-only browser preview checked desktop and 390px layouts, no-match filtering, and Clear filters recovery. No real entry, check-in, receipt, void, or payment status was changed.
- No database migration is required.
