# Producer recovery screens — October 15, 2026

Unexpected render/load failures now have a shared recovery screen across producer
pages, event records, and settings. The existing setup-check and arena fallbacks
use the same component with contextual wording and destinations. Retry uses this
repository's Next.js 16.3 `retry()` prop to re-fetch the affected segment.

The fallback focuses its heading, offers a pending retry state, and provides a
clear route back to the dashboard, event list, or templates. Internal exception
messages and stack traces are not rendered by the app's recovery component.
Optional guidance explains that a load failure cannot establish whether an
in-flight save succeeded; users should check the saved record before repeating a
payment or result. The old unconditional claims that no settings/timing records
changed have been removed.

Missing or inaccessible producer records now have a consistent unavailable-record
screen. Event records link back to Events and explain that the record or current
producer/staff access may be the reason. The wording does not confirm whether a
restricted record exists.

## Scope and verification

- These boundaries handle unexpected descendant rendering/load failures. Expected
  form validation and save errors continue to use their existing inline feedback.
  An error boundary does not catch its own layout's failure; the authenticated shell
  and global/public error handling remain separate work.
- No financial, timing, permission, or database logic changed.
- All 567 tests passed, including retry suppression while pending, heading focus,
  safe navigation, internal-error privacy, uncertain-save guidance, and boundary
  configuration.
- ESLint, TypeScript, and production build passed.
- Browser verification used an intentionally failing temporary route to exercise
  the actual producer boundary and retry, plus an unavailable event record.
  Desktop/390px layouts, focus, disclosure guidance, and navigation were checked.
  The temporary route and generated preview types were removed before building.
- No migration was introduced. A full linked migration dry run confirmed Supabase
  is up to date.
