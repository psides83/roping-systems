# Season Standings

## Agreed Rules

- Standings belong to a producer, season, division, and competition classification.
- All official winnings count: main purse, go rounds, aggregate, short round, side pots, and insurance.
- Credit earnings to the class competed in, including entering down.
- Handicap and 4-D each have one combined standings group, not groups for each handicap or D.
- Display rank, name, city/state, earnings, ropings entered, and handicap where applicable.
- Attendance counts distinct ropings entered in that class, not calendar days or multiple entries in the same roping.
- Classification moves carry season earnings to the new class. Existing lower-number earnings roll separately to the next class.
- Producers may cap transferred money at the destination class leader's earnings.
- Earnings transfers do not create attendance in a class the roper never entered.
- Equal earnings share a rank; all ties at a qualification boundary qualify.
- Qualification may require a top placing, minimum attendance, or both, with an optional cutoff date.
- Keep previous seasons publicly accessible.

## Calculation Foundation

`src/lib/season-standings.ts` rebuilds totals from official contributions and date-effective moves. It records original and capped carryovers separately. Historical cutoffs exclude subsequent earnings and moves. Whole-cent amounts avoid floating-point money calculations.

Supply every qualifying entrant, including non-winners with zero winnings; a payout-only feed would omit attendance. Awards may have multiple rows for the same entrant and roping. Attendance is deduplicated by roper, class, and roping.

Classification ladders must be division-specific and exclude Open, youth, and handicap groups. Their ordering is producer-owned, not inferred from classification names. Date-only classification moves take effect before competition on that date.

## Remaining Integration

1. Add producer carryover review tools and explicit handling when earnings cannot roll beyond the last numbered class.
2. Broaden end-to-end tests for classification moves and qualification using retained test events.

The public standings page, season/class selectors, search, official payout data source, and carryover-cap setting are implemented. The cap policy is saved on each new classification assignment so future policy changes do not affect past moves. Producer settings support per-season/class top-place requirements, minimum ropings, and an optional cutoff. Public standings show qualification against those requirements, using historical totals through the cutoff while retaining current season winnings in the main table.

Each scheduled roping can opt into requirements for its own class and a selected season through the Qualification dialog. Configure this before accepting entries. Office entry creation, online request acceptance, transfers, and reinstatements enforce qualification. Online requests remain requests, not accepted entries. Existing eligibility exceptions record the reason and approving staff member. Qualification checks are persisted privately and refreshed automatically before these office actions when standings or rules change; direct database entry attempts with stale checks fail closed. No qualification requirement applies to ordinary ropings. Changes to official source data invalidate the cached check. A cutoff limits the results included but corrections to earlier official results still update qualification.

Database tests verify payout totals, deduplicated attendance, tenant isolation, cutoff validation, limited public profile fields, entry acceptance/rejection, recorded staff overrides, and stale-data protection. Producer carryover review tools remain unfinished.

Public schedule and online-entry notices show requirements only for explicitly opted-in ropings. Missing or mismatched rules direct contestants to the producer rather than advertising stale requirements. A private Qualifiers page on each opted-in roping shows current cutoff-based standings, attendance shortfalls, accepted entries, and recorded eligibility exceptions. Its read-only preview does not alter the entry-check snapshot. Search and status filters retain original standings ranks. Exceptions remain staff-only; they are not included in public notices.
