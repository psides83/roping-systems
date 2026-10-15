# Funds and reports clarity

Fund accounts now explain all-season balance, reserved money, and available money. The season picker sits directly beside contribution activity so its scope is clear. Contribution amounts show cents, and empty periods offer an all-season link and template guidance. Empty-account instructions respect finance access.

Reports show an applied-scope summary, including resolved record names, payment status, search text, and effective date limits. Financial dates reflect the existing season boundary rules; standings show their season-end default. Reset links clear optional filters. Export guidance explains that CSV contains all matching rows while the preview shows at most 50. Form controls and the download action have larger touch targets. Download handlers ignore disabled or pending actions and retain recoverable error feedback.

Validation: production build and lint passed; 581 tests passed across the full suite and added download checks. Scope tests cover season limits, standings defaults, all-season cutoffs, applicable labels, and escaped search text. Download tests cover suppressed duplicate requests, applied URLs, and non-CSV errors. No authenticated visual review was performed for this batch. Supabase dry run confirmed no pending migrations; no schema changes were needed.
