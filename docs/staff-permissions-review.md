# Staff Permissions Review

Reviewed against the linked database on October 8, 2026.

| Role | Intended Write Access | Restrictions |
| --- | --- | --- |
| Owner | Producer setup, members, events, timing, finances and staff management | Cannot create another producer unless also the Platform Owner; last owner cannot be removed |
| Administrator | Producer setup, members, events, timing, finances and staff administration | Cannot grant owner access or manage protected owner accounts |
| Operator | Producer operational setup, members, events, timing and finances | No staff administration or event/arena assignment authority |
| Event Manager | Manage, publish, enter contestants and time assigned events; event cash adjustments | No producer-wide setup, staff administration, fund management or payout disbursement authority |
| Treasurer | Producer funds, roping funding, cash adjustments, payout finalization and receipts | No competition management, timing, classifications or staff administration |
| Entry Office | Entries, optional choices, check-in, contact corrections and cash collection in assigned active events | No eligibility overrides, complimentary entries, class transfers, timing, fund changes or cash reversals |
| Timing Staff | Timing, corrections and reruns in assigned events/arenas | Must hold that roping's timing control; no draws, entries, setup, finances or manager-only takeover |
| Viewer | Read-only producer access | No staff mutations, even when assigned to an event |

Specialized roles retain read-only producer visibility outside their authorized
workspaces; event/arena assignments constrain writes, not all producer reads.
Public schedules/results remain available independently of staff membership.

## Corrections

- Removed authenticated/anonymous execution of the two internal short-round
  settings helpers. Guarded event workflows can still use them internally.
- Disabled event creation and duplication controls for specialized/read-only
  roles. Database authorization remains the authoritative protection.
- Updated older workflow tests for mandatory timing leases and revoked direct
  timing-table writes.

## Verification

Linked-database tests run inside transactions and roll back all fixtures:

- `supabase/tests/final-staff-permissions.sql`: all eight roles, assigned and
  unassigned events, revoked assignments, cross-producer isolation, actual RPC
  calls, direct-table writes and private helper execution.
- `supabase/tests/timing-staff.sql`: timing, corrections, reruns and restricted
  workflows.
- `supabase/tests/entry-office.sql`: entry-office workflows and denied overrides.
- `supabase/tests/event-manager-treasurer.sql`: event management, competition,
  funds, sponsor funding, payout finalization and receipt acknowledgment.
- `supabase/tests/arena-timing-control.sql`: arena scope and timing ownership.
- `supabase/tests/platform-producer-access.sql`: Platform Owner creation and
  last-owner protection.
- `supabase/tests/staff-invitations.sql`: staff invitation privilege boundaries.

These tests cover current permissions and representative workflows, not an
exhaustive independent penetration test. New staff-facing database functions
must authorize their target producer/event and receive regression coverage.
