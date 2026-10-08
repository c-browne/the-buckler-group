# TCI release checklist (2026-10-08)

Production is intentionally NOT activated by this PR alone.

## Provisioned services (admin action)
1. In [Cloudflare Turnstile](https://dash.cloudflare.com/?to=/:account/turnstile), create widget named `TBG TCI Executive Participation`; mode Managed; authorized hostname `thebucklergroup.com` (and the preview hostname for preview tests).
2. Add `TURNSTILE_SITE_KEY` (public) and `TURNSTILE_SECRET_KEY` (secret) in Netlify > the-buckler-group > Environment Variables.
3. Add cryptographically random `TBG_REGISTRATION_SIGNING_SECRET` (at least 32 random bytes, securely generated), and `TCI_ZOOM_JOIN_URL` (secret); do not commit either.
4. Verify domain thebucklergroup.com with Resend, authorize a sender (such as events@thebucklergroup.com), and add `RESEND_API_KEY` and `TBG_VERIFICATION_FROM` securely in Netlify.
5. Confirm the existing `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, `AIRTABLE_APPLICATIONS_TABLE`, `AIRTABLE_ORGANIZATIONS_TABLE` are still configured.

## Review controls
- In Airtable Executive Applications, first-time TCI applicants must be manually moved to **Approved** following review.
- The scheduled function scans up to four approved records every 15 minutes, sends a verification email with a 48-hour approval link, and records `TCI Access Delivery State=Sent` and timestamp.
- `Failed` deliveries need operator review; reset to `Pending` for retry after fixing the error. `Sending` may require manual reconciliation after an interrupted invocation.
- Only the verified recipient gets an authorized access cookie; the Zoom URL is returned from the protected endpoint, not in the approval email.
- The public repository must not contain any Zoom password or API keys.
- Past participants receive automatic access only when they have a trustworthy prior `Registered` or `Approved` record. Historical participation evidence must be reconciled; do not automatically label all prior applications as registered.

## End-to-end release gates
- Run npm test; verify CI green.
- Preview: invalid/missing Turnstile response fails; valid challenge succeeds.
- Preview: honeypot submission blocked, duplicate rejected, invalid input rejected, flagged applicant held.
- Preview: approved past registrant gets verification email; unverified identity cannot view Zoom.
- Preview: first-time unapproved applicant sees only pending review.
- Preview: move a controlled test applicant to Approved; confirm scheduled email, status/timestamp, verified Zoom access and calendar invitation; no duplicate sends.
- Verify forms/thank-you page on mobile and desktop; Netlify production deploy is ready.
- Only then merge PR #6 and do a low-volume internal GMass test before sending the prior-participant campaign.
