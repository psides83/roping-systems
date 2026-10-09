# Event setup readiness

The Manage Event Publish and Start event controls open a setup review before
submitting. The server rechecks blockers when these actions run, so a stale
review does not authorize a known invalid setup. Access requires event management
permission and every read is scoped to the active producer and event.

## Blockers

- No scheduled ropings.
- A roping date outside the event's dates (producer's time zone).
- A fixed start listing without a time.
- A follows-previous listing with no earlier roping on that date in that arena.
- Starting with an incomplete copied payout schedule, including 4D paid places.

## Warnings

- Incomplete payout schedules when publishing a future schedule.
- No main payout plan; this may be intentional for points-only competitions.
- A tentative listing without a time.
- Identical start instants in the same arena on the same date.
- Unreviewed template changes. Explicitly keeping the current settings resolves
  this warning; the review never automatically changes fees or competition.

First Available ropings do not receive fixed-arena collision warnings. Without
duration estimates, different start times cannot reliably establish overlap.
Draws, entry counts, final payouts and resolved runs are deliberately not
prerequisites for publishing or starting. Final readiness remains a separate
check before completing competition or marking results official.

This review covers the Manage Event publication and event-start controls. It
does not replace existing transactional database protections or the validations
in the event creation/edit forms.
