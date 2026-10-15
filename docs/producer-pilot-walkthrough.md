# Producer pilot walkthrough

## Completed review — October 15, 2026

A local preview walkthrough followed Dashboard → Setup checklist → Events → Create event → Event desk. Verified event-creation initial focus, Escape cancellation, return focus, and the live desk workflow destinations. Preview data does not validate database transactions or real staff permissions.

The walkthrough also verified the template reorder warning at 390px: change the order, attempt Dashboard navigation, choose Keep editing, and confirm the draft remains; Cancel restores the original order. Merely opening reorder mode does not mark the list dirty.

Fixed two recovery gaps:

- Template order drafts now use the existing unsaved-changes dialog, including protection while saving.
- Setup and final readiness checks catch connection failures, display retry guidance, and retain their blocking state until a successful check. Refresh discards a previous successful result before checking again. Retry controls have text and larger touch targets.

Validation: 592 tests passed, lint and production build passed. Regression coverage exercises initial and refreshed readiness failures, successful retry, blocked publish/complete actions, and draft guard activation after reorder versus save/cancel. Supabase migration dry run found no pending migrations. No schema changes were needed.

## Real producer pilot checks

Run these with agreed test records before accepting live event activity. These are remaining acceptance checks, not claims that production transactions have been exercised.

| Step | Producer action | Expected result |
| --- | --- | --- |
| 1. Staff access | Sign in as a manager, viewer, and designated finance staff member. | Each role sees and can perform only its permitted work; restricted actions explain the access needed. |
| 2. Producer setup | Review divisions, classifications, season dates, payout schedules, and one template in each division. | Setup guidance points to missing requirements. Tie-down and breakaway remain separate; reordered templates retain their saved order after refresh. |
| 3. Schedule | Create a hidden test event, add ropings, review dates/arenas, and inspect publication readiness. | Copied template settings and the running order match the intended event. Visibility is an explicit choice. |
| 4. Membership and entries | Submit a test membership application and entry request from a phone, then review them from the producer desk. | Receipt and status are discoverable; submitted requests remain distinct from accepted entries. Required fields and eligibility failures explain corrections. |
| 5. Entry desk | Accept the test request, check in, and record the agreed test payment. | Entry counts, fees, balance, and payment history agree. Refresh preserves the accepted entry and recorded payment. |
| 6. Competition | Prepare and lock the draw, record test runs, and exercise a rerun or short round when applicable. | Current roper and round are clear. Unresolved runs prevent inappropriate completion. Corrections remain traceable. |
| 7. Payouts and closeout | Review calculated awards, finalize the test payout plan, and inspect receipt/acknowledgment and closeout states. | Calculated awards, payments, and receipt acknowledgments are distinct. Outstanding items link to their source. Event completion and official results do not imply that all money is settled. |
| 8. Publication and exports | Inspect public event/results views and export a scoped report. | Visibility matches the producer's choice; official/unofficial labels are accurate; exported rows and totals match the applied scope. |

Record the device, role, action, expected result, actual result, and any confusing wording for each issue. Prioritize anything that blocks work, loses edits, obscures balances, or produces a misleading confirmation.
