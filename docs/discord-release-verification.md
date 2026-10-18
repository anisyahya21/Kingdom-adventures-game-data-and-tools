# Discord release verification

## Production provider check

On 2026-10-18 at 14:44 UTC, `/ka-api/auth/discord/health` returned `status: ready`, `transport: vercel`, `retryAfterSeconds: 0`, and `credentialsAndIdentityVerified: true`.

This performs Discord's documented owner-only client-credentials grant with the real application credentials, retrieves `/users/@me`, and revokes the temporary token. It creates or links no website account and sends no message. It verifies real credentials and provider connectivity; it is distinct from a browser authorization-code round trip.

The former Render connection returned HTTP 429 with a provider reset of 31,334 seconds. Discord traffic now uses one authenticated Vercel function, with signed timestamped requests, fixed Discord destinations, replay rejection and private/no-store responses. Database identities and sessions remain in Render's configured database. The same transport is used for reminder linking and delivery. The transport secret is configured only in the two hosting platforms; no Discord credentials were reset or committed.

## Automated checks

- Actual authentication router, isolated PostgreSQL, controlled Discord fixture: browser binding, authorization-code request, identity validation, linking to the original Telegram user, preserved profile, valid new session, replay rejection, unlink retaining Telegram.
- Transport: unsigned, stale, modified, replayed and arbitrary-destination requests rejected; provider responses and retry headers preserved. No external test messages.
- Provider response handling: HTML, invalid JSON, 401 and 429; real retry-after enforced without repeating a user's authorization code; temporary verification-token cleanup.
- Production: signed Discord gateway request succeeds; unsigned function request returns 401; invalid callback returns 303 to the profile recovery notice.
- Recovery design: local and production browser inspection; dismissal clears the notice; countdown disables retries; the Telegram account remains signed in.
- API typecheck and build pass. Frontend build passes. Frontend typecheck retains the existing 48 diagnostics, with no new errors in changed files.

Real user browser consent/linking and recipient-specific DM privacy are not claimed as completed by these checks. The bot identity check is read-only and sends no messages.