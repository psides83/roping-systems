# Seasonal Membership Dues

- Settings > Membership Dues defines a seasonal charge, installment policy, fixed-dollar or percentage allocation, and default active fund.
- Members > Membership Dues provides seasonal/all-time charged, collected, outstanding, contributed, and retained totals.
- Add seasonal dues explicitly for a member. Choose a destination fund override at that point; classifications do not route money automatically.
- Exactly one charge is permitted per membership and season. Charges snapshot the current settings. Subsequent settings changes affect new charges only.
- Amounts are recorded in cents. Installment contributions use cumulative rounding so full payment deposits exactly the allocation.
- Payments represent money already received; selecting Card does not process a card. Payment references make retries idempotent.
- Reversals preserve the original payment and append a negative payment and fund adjustment. Insufficient available fund money blocks reversal atomically.
- Dues do not change membership approval/status or entry eligibility. No dues are inferred from existing member records or imported history.
- Owners/admins configure dues. Owners/admins/operators/treasurers assess charges and collect or reverse payments. Other staff have read-only access; public/anonymous users cannot read these ledgers.
- Payments and automatic fund transactions identify staff and remain in the producer changelog.

Database: `20261008180000_membership_dues.sql`.
Rollback-only integration tests: `supabase/tests/membership-dues.sql`.
