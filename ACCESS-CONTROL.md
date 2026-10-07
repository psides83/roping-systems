# Producer Access Rollout

Platform ownership is stored separately from producer staff roles. The verified existing account `psides83@hotmail.com` is the sole initial platform owner. Authenticated users cannot read or write the platform-owner table or call the internal producer-creation function. Producer creation is checked in both the server action and database.

Public signup creates a personal roper login, never a producer or staff assignment. Producer onboarding is available only to the platform owner. Existing producer access remains intact. Staff role changes cannot change staff identity, administrators cannot manage owner/admin accounts, and the last producer owner cannot be removed.

## Remaining Work

- Platform provisioning form that assigns an invited initial Producer Owner rather than the platform owner.
- Specialized Event Manager, Entry Office, Timing Staff, and Treasurer roles. Do not expose these until their database policies and privileged functions enforce their scoped permissions.
- Event-specific assignments and permission tests across every write workflow.

Existing roles remain owner, admin, operator, and viewer during this security foundation phase. Operator remains broad event-operating access, not a substitute for a limited timing or entry-office role.

Staff management is available at Settings > Manage staff. Invitations expire after seven days, require a matching verified auth email, and recheck the inviter's current authority at acceptance. Owners may invite administrators/operators/viewers; administrators may invite only operators/viewers. Only the platform owner's invitation form includes Producer Owner. Cancellation, role changes, and revocation are audited; direct authenticated writes to the staff table are revoked. Removing staff also cancels outstanding invitations for that person and producer.

Invitations are currently created in-app, not sent by email. Invitees can use `/staff-invitations` after signing in; password sign-in redirects there when an active matching invitation exists. Automated invitation email delivery remains to be connected. Producer selection explicitly loads only the signed-in user's own staff rows, never colleagues' role records.
