# Platform Owner Recovery

Platform Admin requires both a registered platform-owner user ID and a Supabase AAL2 session. Producer staff permissions are unchanged. A password reset does not bypass this gate.

## Before Losing A Device

- Enroll a backup authenticator from Platform Admin > Security, on a separate device or securely backed-up authenticator.
- Protect access to the Supabase project with its own MFA and keep its recovery material separate from the app authenticator.
- Enrollment QR codes and secrets are shown only during setup; the app does not store them in its own tables or browser storage.

## Recovery

1. Try a verified backup authenticator on the app's verification screen.
2. If every authenticator is unavailable, use trusted Supabase project administration. Confirm the exact account user ID against `platform_owners`; do not grant ownership to a new email address as a shortcut.
3. Reset only the lost MFA factor through Supabase's supported user administration. Record the recovery reason and operator in the project's administrative records. Never copy factor secrets into a ticket or note.
4. Revoke the account's existing sessions through supported Auth administration. Sign in again and enroll a replacement authenticator; Platform Admin remains blocked until verification succeeds.
5. Add a backup authenticator and confirm both devices work. Review Supabase Auth audit logs and the app's verified admin-session history.

There is intentionally no app-level recovery bypass or shared master password. Verified admin-session history is not a complete authentication audit log; Supabase Auth audit logs are the authoritative source for enrollment, verification failures, and factor removal.
