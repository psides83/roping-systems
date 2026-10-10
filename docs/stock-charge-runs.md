# Stock Charge Runs

Open **Stock charge runs** from an event dashboard. Event managers enable sales,
set separate per-roper run and score limits, add packages, and schedule sessions.
An empty limit means unlimited. Limits count purchased units, including used
units; canceled purchases do not count.

Packages are event-specific. Purchases retain their original name, quantity and
price. Deactivate a package and add its replacement to change prices without
changing existing purchases.

Sessions use an event date and arena, with a fixed start time or a preceding
roping in that same arena on the same day. Close a session to stop recording use
against it. To reschedule, close the old session and add the replacement.
Removing a preceding roping closes its practice session automatically; past
practice usage remains recorded.

Entry-office staff can sell packages to existing ropers or create a new roper
with first name, last name and phone. A competition entry is not required.
New records are linked to the producer, but do not approve a formal membership.
Practice purchases create no competition runs, results, attendance or standings.

Record the full payment received before marking a run or score used. Choose the
session first, then mark one unit used. No partial payments or complimentary
practice packages are supported in this initial workflow.

Financial correction staff can undo an incorrectly recorded use, or cancel an
unused purchase. Canceling a paid purchase records that its refund was issued;
it does not transfer money electronically. All active uses must be reversed
before a purchase can be refunded. Every correction requires a reason.

Payments contribute to event collections and non-payout income, separately from
competition fees. Reconciliation includes these receipts. No money is allocated
to competition purses or funds.

All mutations lock the event, enforce permissions in the database, and prevent
overuse or exceeding purchase limits. Purchase and usage retries carry request
IDs to avoid duplicate records. Audit history retains before/after values,
staff identities, timestamps and correction reasons.
