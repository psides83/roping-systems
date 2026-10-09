# Member Activity

The Activity tab on a producer's member record combines existing records into a latest-first timeline. Details keeps the member's current information and management controls. Filters cover season, activity type, and an inclusive date range; pages contain 30 items.

The timeline includes entries and their current charges, entry transfers/status changes/removals from the producer changelog, recorded round times and aggregates, classification assignments, dues assessments/payments/reversals, fines/payments/waivers, suspension issuance/lifting, canonical bonus positions and current assignments, and payout receipts/acknowledgments/reversals. Winnings reuse the payout register calculations, not a separate payout engine.

Date-only actions keep their effective date. Timestamped actions use the producer's time zone. Dues and qualifications are linked to their explicit season; other activity uses its occurrence date. Current statuses and current calculated results are identified as such, not presented as historical snapshots. Bonus positions recalculate when official results or staff decisions change; assignment rows reflect the latest assignment, not every prior reassignment. The changelog remains the complete edit history.

All reads use the authenticated client and existing row-level security, scoped to the verified active producer. Management-only history and notes are omitted for restricted staff. Financial sources are only loaded for managers or treasurers. This release is staff-facing only; there is no public or roper-facing timeline endpoint and no new activity data store.
