# UX foundations — first batch

Implemented October 15, 2026, following the producer UI/UX review.

## Changes

- Template and fee editors share a native modal with an accessible title and
  description, initial field focus, contained keyboard focus, Escape dismissal,
  focus return, and scroll locking. Closing changed forms asks before discarding
  edits; closing while saving is blocked. Reopening resets controlled choices
  from the current saved template or fee.
- Mobile navigation is inert when closed, contains focus while open, and returns
  focus to the menu button when dismissed. Roping setup opens its checklist.
- Setup/settings navigation uses a labeled section selector on phones. Desktop
  tabs retain the current destination in view and preserve feature visibility.
- Template cards give their summaries full width on phones, use readable summary
  text, and disclose secondary competition details. Descriptions explain how
  saved template changes apply to existing scheduled ropings.
- Template, event-schedule, and sponsor reorder controls identify automatic saves
  and announce saving, success, or failure. Rules and live-draw saves keep their
  existing explicit save behavior.
- The dashboard leads with the live event and actionable attention items. Pending
  approvals open the pending-members filter; unpaid entries open their event's
  filtered ledger. The page uses the producer's date/time zone, removes the fixed
  greeting and season label, and distinguishes the next future date from recent
  event history. Query failures do not silently become zero dashboard counts.

This batch does not implement the later help center, setup-flow redesign,
financial-workflow redesign, or content-specific template timestamp tracking.
The review remains the roadmap for those phases.

## Verification

- Full application tests, type checking, lint, and a production build.
- Browser checks at desktop and 390 × 844 phone sizes: template summaries,
  modal initial focus/Escape/focus return, mobile navigation, selected setup
  section, and dashboard links to pending memberships and unpaid entries.
- Browser checks use demo data. The database regression scripts for the earlier
  template/sponsor reorder migrations still require a running development database.

The two reorder migrations must be applied in the target database to enable
those previously added reorder actions. This UI batch introduces no additional
schema migration.
