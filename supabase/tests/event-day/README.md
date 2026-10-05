# Event-Day Tests

## Current V2 Fixtures

```sh
npm run test:events -- --producer=ultimate-calf-roping --replace-tests
npm run test:events -- --producer=ultimate-calf-roping --replace-tests --seed
```

The first command validates the entire replacement and rolls it back. The second
commits it atomically. Cleanup targets the two V1 weekends, the explicitly identified
manual Test event, and previously generated V2 fixtures only. Members are retained.
No cleanup is included in deployment migrations.

V2 reuses the 96 `TEST-V1-` memberships and their actual classification history.
Their names are refreshed to distinct fictional names; example.com addresses and
member IDs remain intact. Current numbered classes have separate ropings with mostly
matching-class members and one eligible higher-number entrant. Open, Handicap, 4D,
youth classifications, repeated class occurrences on another day, and all active
producer templates are exercised.

Two completed public weekends are dated November 7-8 and November 21-22, 2026.
They have official results, finalized payouts, and sample acknowledged/reversed
payout receipts. A partially scored public live event is dated December 5, and an
upcoming public event is dated December 12. Both include two arenas, fixed and
tentative times, and follows-previous schedules.

Funding scenarios use inactive `TEST Fund / ...` template copies, preserving active
producer templates. They include shared and classification-routed contributions,
one grouped entry deposit per completed roping/fund, sponsor received/pledged policies,
fund reservations and finalization debits, reopening, manual awards debits, and
sample cash payout acknowledgments. All money is simulated. Fixture funds and
events are clearly labeled TEST. Public fixtures are deliberately published.
No artificial opening balance is added; allocations are covered by completed
roping contributions. `supabase/tests/fund-ledger.sql` checks completion-only
posting, single-row corrections, reopening, and protection for spent contributions.
`supabase/tests/event-fee-summary.sql` checks itemized collection totals,
once-per-event charges, partial cash receipts, voids, and producer isolation.

The checks cover database competition, scoring, fee, funding, payout and public
projection behavior. They are not exhaustive browser, concurrency, load, payment
processor, or online-entry authentication tests. Separate regression scripts cover
fines, suspensions, penalties, season rules and payout schedule validation.

## Historical V1 Fixture Notes

These tests use the named producer's active templates, fees, payout schedules,
classification numbers, and handicap credits. They never edit real members or
existing events. The current fixture expects numbered classifications including
11.5, an Open classification in each division, and four handicap classifications.

## Run

```sh
npm run test:events -- --producer=ultimate-calf-roping
```

This creates a fresh simulation and rolls it back. Supabase CLI authentication
and a linked project are required. Add `--local` to use a local Supabase instance.
Failures exit nonzero and roll back the entire transaction.

## Retain Test Data

```sh
npm run test:events -- --producer=ultimate-calf-roping --seed
```

This saves 96 members with `TEST-V1-` member numbers and two completed,
unpublished events named `TEST Suite - Weekend 1` and `TEST Suite - Weekend 2`.
Members have reserved example.com email addresses and no login accounts.
The events are dated August 22-23 and September 19-20, 2026. They support future
standings and attendance work without replacing the currently live public event.
Repeating this command preserves existing fixture events rather than overwriting
changes made while exploring them. Use the normal test command for fresh tests
after changing templates. Do not put this retained-seed command in deployment migrations.

## Coverage

- Every active template and its copied settings/fees.
- Six numbered member classifications, Open tie-down, Open breakaway, and handicap Open/A/B/C.
- Numbered entry-down permission, entry-up rejection, and multiple-entry limits.
- Separate instances of the same classification on two event dates.
- First-round last-entered-first ordering, rebuilds, and reverse second-round starts.
- Multi-timer average, best, longest, hundredth rounding, penalties, no-times, reruns, corrections, and round locking.
- Short-round fields selected from the configured entry-count bracket.
- 4-D final-time bands and entry-count payout brackets, using different field sizes on each weekend.
- Full main-purse and 4-D payout allocation, including tied places and cent rounding.
- Required charges, once-per-weekend office fees, optional pots, main purse calculation, and payout limits.
- Optional-pot winners' selections, insurance exclusions, and tied payout splits.
- Public aggregate availability while published; saved fixtures are unpublished at completion.

Warnings identify missing payout schedules and uncovered 4-D place-percentage
ranges instead of silently altering template configuration. Dollar allocation
checks require an applicable payout range; ranking and scoring checks still run.
Cash statuses are simulated; no payment processor or actual cash
disbursement is used. These are database integration tests, not browser workflow,
concurrency, or load tests. Age/gender exceptions, transfers, refunds, and payout
disbursement coverage can be added as those workflows are hardened.

## First Run Findings (October 4, 2026)

The retained fixtures contain 96 members, 16 ropings, 784 entries, and 1,879 runs.
The final fresh simulation passed 2,237 assertions and reported configuration
warnings; this is not a clean validation of every dollar payout.

- Fixed a NULL fee-kind filter that incorrectly excluded main jackpot winners
  and could overlap main and insurance payouts.
- Open BA has no selected payout schedule.
- The No Short Round Payout schedule's aggregate brackets stop at 30 entries,
  while the tested fields contain 36-60 entries.
- The 4-D schedule's generic go-round place percentages cover only 1-10 entries,
  while its D settings require multiple paid places for fields of 56 and 72.
- The template titled TD | 2 & Short for 250 | 2x is configured for one main
  round, not two. Fixtures follow the saved setting, not the title.

Complete the payout schedules and rerun the normal test command to validate the
previously blocked dollar-allocation checks. Existing retained fixtures are
snapshots and are not automatically rewritten after template edits.
