# Producer Migration

Producer settings > Migration imports historical winnings, class attendance, and opening fund balances from CSV or Excel worksheets. Import members first; create the season, classifications, and named funds before matching spreadsheet values.

## Import Types

- Historical winnings: member number, standings class, effective date, amount. Credits standings only; never creates an award, payout owed, or cash receipt.
- Historical attendance: member number, standings class, effective date, positive whole roping count. Counts toward class-specific qualification without creating entries or runs.
- Opening fund balances: existing fund, effective date, positive balance. Creates a manual ledger deposit with the as-of date, source description, and import reference in its reason. The ledger records when the import actually occurred. It does not replace the fund's existing balance.

Numbered and standalone classes are available alongside combined Handicap and 4-D standings classes. Historical winnings participate in subsequent class moves and the producer's carryover cap; attendance remains with the class actually attended.

## Dates And Cutoffs

Each row contributes on its effective date, within the selected season. A summary balance as of September 30 cannot establish standings or attendance as of September 1. Use individually dated historical records if earlier qualification cutoffs or intervening class moves need to be reproduced. Money and attendance can be imported separately with different dates.

Do not import history already represented by official results in the app. Imported and app-generated contributions are additive.

## Approval And Duplicates

Choose the worksheet/header row, map columns, and explicitly match spreadsheet classes or funds. Review the resolved member names and dates, exclude duplicate/error rows, and approve the selected records.

Source references are optional. Without a mapped reference, the importer uses type, member number, target class/fund, and date. Combine same-day summary rows or provide distinct stable references for separate contributions. References are checked across active imports of the same type and season. Repeated requests using the same batch reference cannot credit records twice. Opening funds allow only one active imported opening balance per fund.

## Corrections And Permissions

Reverse an import with a stated reason, then import corrected history. Original rows, source information, column mapping, actor, and reversal remain in the audit trail. Fund reversals use offsetting ledger entries and cannot consume money already spent or reserved. Imports and reversals invalidate cached qualification checks.

Producer managers can import standings and attendance. Finance managers and treasurers can import opening funds. Read-only staff cannot approve or reverse imports.

Each worksheet supports up to 500 records and 100 columns, with a 5 MB upload limit. Recent import history displays the latest 50 batches.
