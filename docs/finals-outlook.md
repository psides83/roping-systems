# Qualification Outlook

Ropers can open **Qualification outlook** in their portal. It lists published, upcoming qualification-required ropings for the selected producer season, including relevant ropings affected by classification or membership restrictions.

Each roping shows its qualifying standings position, attendance progress, assigned bonus positions, entry allowance if eligible, and separate attendance and standings cutoff dates. Cutoff dates include that day. Pending positions are shown separately and never increase the allowance. Expired positions do not count.

The calculations reuse the entry eligibility and standings engines, including ties, class moves, bonus waiver policies, and either/all requirement matching. Only official results through the earlier of today and each cutoff are used. Attendance is calculated independently of the standings cutoff. Assigned positions must belong to the particular target roping; a classification-change review is surfaced rather than silently counting a position.

Staff can expand **Projected qualifying field** on a roping's qualification page, even before saving its first qualification check. Search and status filters help review ropers who still need attendance or a qualifying standings position. This is a qualification-only preview: membership, classification, fines, suspensions, staff exceptions, and capacity remain part of entry review.

Neither view saves a qualification check, awards a position, reserves capacity, or approves an entry. Existing entry checks remain authoritative. Setup changes are reflected on the next load without changing historical qualification decisions.

The portal context function is restricted to authenticated accounts linked to the requested membership. It filters producer/season ownership and published upcoming events. It does not return private event information or staff notes. The linked-database regression test runs inside a rolled-back transaction, so fixture changes are not retained.

Verification: `tests/finals-outlook.test.mjs` covers deadlines, requirement matching, bonus assignment, full-field ranking, ownership failures, no-data states, and UI filtering. `supabase/tests/finals-outlook.sql` checks published/private scope, qualification overrides, ownership, privileges, and read-only behavior.
