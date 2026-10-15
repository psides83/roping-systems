# Private staff and audit lookups

Applied to the linked Supabase project on October 15, 2026:

- `20261013130000_private_staff_directory.sql`
- `20261013130100_private_audit_history.sql`

These migrations move authentication-account lookups out of API-facing views and
into private functions. The public staff-directory and audit-history views retain
their existing columns and producer membership checks. Anonymous reads and direct
private-schema access remain restricted.

Both migrations and the supporting access tests passed in a rolled-back preflight
transaction. The access tests passed again after application. A full migration
dry run then reported no pending migrations.

The accompanying `supabase/tests/event-day/refresh-retained-times.sql` is a
separate fixture-maintenance script, scoped to two named test events. It ends in
ROLLBACK and was committed as a test utility; it was not applied as a migration
or run to modify retained competition times during this update.
