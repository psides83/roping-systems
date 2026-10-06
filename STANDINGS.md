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

1. Add producer standings/qualification settings and expose the carryover cap beside classification watch rules.
2. Build a safe public data source from official payout calculations, all qualifying entries, classification history, and limited public roper details. Do not expose contact information or private member records.
3. Persist explicit carryover decisions, with changelog entries and correction handling. Prevent unintended recalculation when a producer changes rules later.
4. Add public season/class selectors and standings tables, plus producer review tools.
5. Connect roping eligibility to standings qualification and cutoff snapshots, with audited staff exceptions.
6. Add database and end-to-end tests using retained test events.

The calculation foundation is implemented; these integrations are not yet available in the app. Handle a transfer beyond the last configured numbered class explicitly in the producer workflow rather than silently inventing a destination.
