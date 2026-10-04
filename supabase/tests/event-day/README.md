# Event-Day Tests

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
