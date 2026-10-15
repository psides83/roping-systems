# Standings and finals usability — October 15, 2026

Standings and finals settings now explain the difference between rank/attendance
requirements, earned positions, and assignments to specific scheduled ropings.
Both link to a task guide in Help & guides. Missing season/classification setup
has actionable links rather than a dead-end message.

Standings requirements retain the existing saved fields and validations, with
larger controls, clearer selected-season/class scope, an explanation of removing
requirements when unchecked and saved, and explicit owner/administrator access
feedback.

Finals assignment status counts now filter the list. Show all positions resets
search and status, the matching count is announced, and the empty state distinguishes
no earned positions from no matches. Read-only access is explained. Target class,
readiness, date/lock behavior, expiry, reason requirements, and server actions are
unchanged.

## Verification

- All 575 tests passed. New checks cover filter recovery, view-only/expired/locked
  restrictions, class/readiness target choices, required reasons, and standings
  field preservation.
- ESLint, TypeScript, and production build passed.
- Desktop/390px browser review used the actual assignments component with isolated
  read-only sample data. Show all positions and status/count updates were checked.
  The temporary preview route was removed before build/commit.
- No real rule, award, or assignment was changed. No migration is needed; the
  linked migration dry run reported Supabase up to date.

Funds, reports, public forms, and a full producer pilot remain follow-up areas.
