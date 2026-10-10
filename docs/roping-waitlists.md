# Entry Limits and Waitlists

Each scheduled roping has an optional entry limit. A contestant with two accepted entries uses two spaces. Managers set limits under Event Entries > Entry limits & waitlists; blank means unlimited.

Entry-office staff can select Add to waitlist in the entry dialog, or move an entire pending online request to its ropings' waitlists. Each requested entry has a separate queue position. Online requests stay waitlisted until all positions are resolved; accepted entries appear separately in the roper portal.

Waiting entries have no charges, runs, draws, purse contributions, or attendance credit. Optional choices are stored and applied when accepted. Staff contact the contestant using the displayed contact links, offer the next waiting position, and confirm the contestant's acceptance. Offers reserve a space until staff accept or decline them. Offers do not expire automatically in this version. Declines and removals require a reason. All changes are audited.

Acceptance rechecks the existing eligibility and qualification rules and creates an unpaid entry plus required and selected optional fees in one transaction. A failure leaves the offer reserved and creates no partial entry. Stale revisions are rejected. Database capacity checks also cover direct entry acceptance, transfers, and reinstatements. Withdrawn entries do not consume space.

Limits are event-specific, not template defaults. Public submissions remain requests requiring staff review; joining a waitlist is currently a staff decision, not automatic public self-enrollment. Staff record offers and confirmations; no email or text message is sent automatically.

Verification: `supabase/tests/roping-waitlists.sql` exercises queues, reservations, stale revisions, acceptance, limits, online multi-entry requests, and authorization inside a rollback-only transaction.
