# Arena Overview

Open **Arena overview** from Manage Event or the event workflow navigation.
This is a read-only event-day command center, not another timing desk.

Each arena shows its current roping, first unlocked round, resolved/remaining runs,
reruns, contestant in the box, on-deck contestant, and next roping. Remaining
includes both pending runs and reruns that still need scheduling. First Available
has its own section and cannot be presented as an active timing arena.

The day defaults to active competition, then the producer-local current date,
then the next unfinished scheduled day. Other event days are selectable. Roping
labels include their division; scheduled times and tentative/follows labels are
shown. The day lineup is collapsed by default.

Missing orders, short-round fields needing review, reruns, unpaid fines blocking the next contestant, completed rounds needing
locking, and multiple ropings marked active in one arena are flagged. Conflicting
active ropings do not select a contestant or silently choose a current desk.

The overview refreshes every 20 seconds while visible and online, with a manual
refresh button and last-loaded timestamp. It does not refresh an open timing form,
claim a timing session, or change any competition data. Offline views are labeled
as showing last-loaded records; failed requests provide retry feedback.

Assigned timing staff see only their assigned arena plus First Available. The
server applies that scope before loading contestants. All reads use the signed-in
Supabase client with producer/event filters; no new elevated-access RPCs are used.
Queries are paginated so large events do not silently lose runs to response caps.
