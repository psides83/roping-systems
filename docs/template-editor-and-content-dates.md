# Template editor and content dates — October 15, 2026

The template editor uses four visible groups: Basics, Entries & rounds, Timing & order, and Payouts. All fields remain mounted so validation and unsaved edits work across sections. Existing defaults, feature visibility, scoring formats, and submitted field names are preserved. The dialog explains that settings are copied into new ropings; existing scheduled ropings require a separate template-update review. Fees remain managed from the template card.

Pending template saves now also disable deletion and the Cancel button, complementing the shared dialog's dismissal guard.

## “As of” semantics

`roping_templates.content_updated_at` records tracked template and fee content changes. Template reordering, fee reordering, and no-op saves do not change it. Fee creation, editing, removal, and movement between templates update the affected template dates in the same transaction. New templates receive a date on creation.

Existing templates deliberately have no backfilled content date. Their old row timestamps included reordering and missed fee edits, so they cannot establish a trustworthy historical content date. Cards show **Update date unavailable** until an actual content change, then **As of {date}** in the producer's time zone. Saving unchanged content does not establish a date.

The template update trigger watches all business columns present at migration time. A future schema migration adding editable template columns should extend that trigger. Timestamp trigger functions cannot be invoked directly by API roles. Fee propagation uses a fixed search path and updates only the matching parent/producer pair.

## Deployment and verification

- Applied `20261015120000_template_content_dates.sql` to the linked Supabase project. Unrelated local migrations were excluded through isolated migration staging.
- Transactional SQL regression checks passed before migration application and afterward. Fixtures and preflight schema changes were rolled back.
- SQL checks cover creation, edits, no-op saves, reorders, unknown historical dates, fee creation/edit/removal/movement, and deletion with cascading fees.
- All 550 application tests passed, including grouped field preservation, the required compatible 4D payout selection, and pending-save controls.
- Lint, TypeScript, and production build passed. Browser preview checked desktop and 390px layouts, initial focus, clean Escape dismissal, and return focus. Preview edits were not saved to production.
