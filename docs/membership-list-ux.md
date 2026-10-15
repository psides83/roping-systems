# Membership list usability — October 15, 2026

Member/roper records now use a labeled stacked layout on phones and tablets,
while retaining the desktop table and a single set of record links. Contact
information, classifications, membership status, joined date, and Open record
are readable without sideways scrolling.

The Active, Pending approval, and Expired summary cards open their corresponding
status filters. Counts now come from the loaded records, including in preview
mode. Membership status selectors retain all supported statuses even when a
chosen status has zero matches. Roper-only mode ignores membership-status links.

Clear filters is available whenever search/status/classification filters are
active, including with the filter panel closed. Export CSV has a visible label;
its existing behavior exports all matching records across pages and escapes
spreadsheet formulas. Empty states distinguish no records from no matches.

Optional guidance distinguishes membership standing, competition classifications,
roper account connections, and producer staff access. Record creation and editing
permissions, eligibility rules, membership approval, and CSV data fields are
unchanged.

## Validation

- All 571 tests passed. New checks cover collapsed-panel filter recovery,
  roper-only status handling, CSV scope across pages/formula escaping, and
  zero-match status links.
- ESLint, TypeScript, and production build passed.
- Browser preview covered desktop and 390px layouts, pending-status filtering,
  closing the filter panel, clearing it, and reading member record details.
  No real member record was changed or exported.
- No new migration is required; the linked migration dry run is up to date.
