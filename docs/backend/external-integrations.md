# External Integrations

This repo integrates with external services primarily through Convex `action`s.

## DataGolf

- Module: `convex/functions/datagolf.ts`
- Type: `action` (network calls)

Notes:

- Requires `DATAGOLF_API_KEY` configured in Convex environment.
- Helpers live in `convex/utils/datagolf.ts` and related types/validators.
- The live tournament sync cron depends on DataGolf data.

## Email provider (Brevo)

- Module: `convex/functions/emails.ts`

Notes:

- Email sending is implemented via server utilities in `convex/utils/emails.ts`.
- Some functionality is internal-only (scheduled or admin-triggered workflows).

## Clerk

- Frontend auth and identity.
- Convex verifies requests via Clerk JWT issuer domain.

## PostHog

- Frontend analytics.
- Providers are configured via `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST`.

See also:

- [auth-and-identity.md](auth-and-identity.md)
- [../getting-started/environment-variables.md](../getting-started/environment-variables.md)
