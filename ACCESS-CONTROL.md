# Producer Access Rollout

Platform ownership is stored separately from producer staff roles. The verified existing account `psides83@hotmail.com` is the sole initial platform owner. Authenticated users cannot read or write the platform-owner table or call the internal producer-creation function. Producer creation is checked in both the server action and database.

Public signup creates a personal roper login, never a producer or staff assignment. Producer onboarding is available only to the platform owner. Existing producer access remains intact. Staff role changes cannot change staff identity, administrators cannot manage owner/admin accounts, and the last producer owner cannot be removed.

## Remaining Work

- Specialized Event Manager, Entry Office, Timing Staff, and Treasurer roles. Do not expose these until their database policies and privileged functions enforce their scoped permissions.
- Enforce event-specific assignments for specialized roles and test every write workflow.

Existing roles remain owner, admin, operator, and viewer during this security foundation phase. Operator remains broad event-operating access, not a substitute for a limited timing or entry-office role.

Owners and administrators can record and remove event assignments in Staff access. Assignments are audited, restricted to the same producer, and automatically removed when staff access or an event is deleted. This is the assignment foundation only: it does not narrow existing Operator access or grant additional permissions to Viewers. Specialized roles remain unavailable until their write workflows enforce these assignments.

Platform provisioning requires the initial Producer Owner email. Creation and invitation are atomic; the platform account retains bootstrap owner access so it can manage pending invitations. Setup opens the staff page to show delivery status and allow retries. The invited owner receives access only after accepting with a matching verified account.

Staff management is available at Settings > Manage staff. Invitations expire after seven days, require a matching verified auth email, and recheck the inviter's current authority at acceptance. Owners may invite administrators/operators/viewers; administrators may invite only operators/viewers. Only the platform owner's invitation form includes Producer Owner. Cancellation, role changes, and revocation are audited; direct authenticated writes to the staff table are revoked. Removing staff also cancels outstanding invitations for that person and producer.

Invitations automatically attempt email delivery when Resend is configured, with visible status and rate-limited retries. Configuration and a live-send check remain outstanding; see `EMAIL-SETUP.md`. Invitees can use `/staff-invitations` after signing in; password sign-in redirects there when an active matching invitation exists. Producer selection explicitly loads only the signed-in user's own staff rows, never colleagues' role records.
