# Staff Invitation Emails

Staff invitations use Resend's send-email API. Configure these environment variables in Vercel and `.env.local`:

- `RESEND_API_KEY`: a server-only Resend sending API key.
- `STAFF_INVITATION_FROM`: e.g. `Roping Systems <staff@your-domain.com>`, using a verified sending domain.
- `NEXT_PUBLIC_SITE_URL`: the canonical HTTPS app URL, not a preview or localhost URL in production.

Verify a domain in Resend using the DNS records it supplies, create a sending key, add the variables, and redeploy. Do not paste keys into chat or commit them. Supabase authentication emails use separate SMTP settings; configuring these variables does not change authentication email delivery.

Creating a staff invitation attempts an email automatically when configured. Without configuration, the invitation remains valid and the form explicitly reports that email is unavailable. Staff managers can retry from the invitation list. Attempts are limited to five per invitation and at least one minute apart. Provider calls time out after ten seconds; failures do not delete invitations. The email status means accepted by the sending service, not confirmed inbox delivery. Delivery/bounce webhooks are not yet implemented.

No live messages are sent by the tests. Email content and rollback-only database delivery permissions are tested separately. A real send test is required after configuration.

Reference: https://resend.com/docs/api-reference/emails/send-email
