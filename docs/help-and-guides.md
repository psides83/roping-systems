# Producer help and setup guidance

Added October 15, 2026 as the next UI/UX batch.

## Help library

Help & guides is available in the producer sidebar at `/help`. Ten task guides
cover first setup, templates, event schedules, entries and payments, live timing,
payouts, publishing, staff access, reports, and event-day printing. Search matches titles, summaries,
and producer vocabulary such as “enter twice,” “2 entries,” and “timing control.”
Category filters organize work before, during, and after an event. The glossary
explains app terminology while acknowledging that organizations may use other
terms on their flyers.

Each guide includes prerequisites, steps, expected results, troubleshooting,
related guides, and a link to the relevant workspace. Unknown guide URLs display
a not-found page. Help is inside the authenticated producer shell and does not
read or expose another producer's data. Guide content does not grant access or
override feature settings, operational restrictions, or staff permissions.

## Guidance in context

- Template and setup headers link directly to their guides.
- Event workflow navigation links to the guide for the current task.
- Contextual links open in a separate tab and announce this behavior so staff
  can retain an unfinished form or timing draft in the current screen.
- Expandable help in template/fee editors explains rounds versus repeat entries,
  attendance counting, and fee display versus payout contribution. Help opens
  in place with touch or keyboard input, supports Escape, and does not require
  hovering.
- Event creation explains the event/roping relationship and the distinction
  between saving, publishing, and opening entries.
- The setup checklist now introduces the path from divisions/classifications to
  reusable templates and the event schedule.

The help catalog and search live in `src/lib/producer-help.ts`; the article route
is `src/app/(app)/help/[guide]/page.tsx`. Keep task descriptions aligned with
behavior when changing operational features.

## Supabase rollout

At the user's request, applied these committed migrations to the linked project
on October 15, 2026:

- `20261015100000_reorder_roping_templates.sql`
- `20261015110000_reorder_producer_sponsors.sql`

A follow-up migration dry run reported the committed migration set up to date.
No seeds or unrelated local migrations were applied. The help batch itself adds
no database objects or changes to entries, schedules, payments, or results.

## Verification

The test suite covers guide routing, related destinations, task vocabulary,
category filters, empty search recovery, help links preserving the working tab,
and unknown guide URLs. Verify search, a guide, and contextual help in desktop
and phone browser previews. Continue checking the full application tests,
type checking, lint, and production build before pushing.
