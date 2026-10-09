# Season rollover

Owners and administrators open **Settings → Seasons → Start next season**.
They choose a source season, review the proposed dates, establish seasonal dues
and fund allocations, optionally assess all active members, and optionally copy
the source season's qualification templates. The final confirmation is explicit.

Rollover is one database transaction with an idempotent request ID. Retries do not
duplicate seasons or charges. Date overlap protection still applies. The source
season, new season, dues configuration and rollover history remain linked.

Divisions, classifications, roping/payout templates, memberships, staff and producer
settings are shared setup, not copied. Memberships are not automatically renewed;
expired memberships, fines and suspensions retain their existing restrictions.
Bulk dues assessment uses memberships currently marked active, including active
records whose expiry dates require staff renewal review. It records unpaid charges,
not payments or fund deposits. Old unpaid dues and existing charges stay unchanged.

Dues configuration is stored per season. Settings → Membership Dues can select
that season to revise future assessments; existing assessments retain their terms.
Producer defaults apply only when a season has no configuration. A season started
without dues has dues disabled until staff configure them explicitly.

Qualification copies point at the new season and receive distinct names. Standings
and attendance cutoffs are cleared (meaning season end) so old dates cannot silently
restrict a new season. Review both dates before using copied templates in an event.
Events, qualification checks, manual/earned positions and assignments are not copied.
Standings and attendance remain separated by the existing season/date calculations;
prior-season positions retain their existing expiry rules and history.

Funds continue as the same accounts, with all balances, reservations and transactions
intact. Rollover snapshots balances at setup time for reference, even when the season
starts later. It never posts another opening deposit or silently clears balances.
Actual fund debits/adjustments remain explicit, reasoned ledger actions in Funds.
