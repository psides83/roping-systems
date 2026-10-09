# Producer Reports and Exports

Reports & exports appears in the producer sidebar. Available reports are standings, official attendance counts, event fee collections, completed-roping payout awards, and fund activity. Each report offers applicable season, classification, event, fund, date, search, and payment-status filters. Changing report type clears incompatible filters.

The table previews 50 rows. CSV downloads include every matching row and are streamed in chunks. Database reads page through API limits. CSV uses UTF-8 with a byte-order mark, CRLF records, quoted text, and spreadsheet-formula protection. Money is in USD with two decimal places; identifiers are retained for reconciliation.

Standings and attendance use the same official contributions, imported opening records, and counting rules as the existing standings system. Standings always start at the beginning of the selected season and apply the inclusive through-date cutoff, preserving classification carryovers. Attendance may be filtered by actual competition dates and event, and counts in the class competed in. Event filtering excludes imported attendance not attached to an event.

Collection and payout date filters select overlapping event dates, including the whole event. Classification filters exclude event-wide charges because they do not belong to one class; select all classifications to include office charges. Collections retain the existing partial-payment allocation rules. Payouts show current awards, amounts paid, remaining balances, and overpayment review states; awards and cash receipts are not interchangeable.

Fund date filters use transaction dates in the producer's time zone. Running balances come from the complete ledger, not a recomputed filtered subset. Reversals remain visible. Manual deposits, roping contributions, membership-dues contributions, and debits retain their reasons and staff attribution.

All report selections must belong to the verified active producer. Financial exports require owner/admin/operator or treasurer access. Restricted staff may export standings and attendance only. The download endpoint independently checks permissions and sends private, no-store responses. No service-role client, new reporting tables, or database migration is required.
