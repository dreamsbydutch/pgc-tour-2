# Troubleshooting

A practical checklist for the most common issues in this repo.

## Dev server issues

### Port / host

The dev server runs via:

- `npm run dev` (port `3000`, host enabled)

### Stale PWA service worker

This repo unregisters service workers in development in the root shell.

If you still see stale assets:

- hard refresh
- clear site data
- check Application -> Service Workers in browser devtools

## Convex API/type issues

Symptoms:

- `api.functions...` missing exports
- TypeScript errors referencing `convex/_generated/*`

Fix:

- run `npm run convex:dev`

Do not edit generated files.

## Auth issues (Clerk/Convex)

Symptoms:

- requests failing with unauthorized
- `getToken` returning null

Checks:

- confirm `VITE_CLERK_PUBLISHABLE_KEY` is set
- confirm Convex is configured with `CLERK_JWT_ISSUER_DOMAIN`
- confirm the Clerk JWT template for Convex is configured

## PostHog issues

If analytics isn’t initializing:

- confirm `VITE_POSTHOG_KEY`
- confirm `VITE_POSTHOG_HOST` (and that it is an ingest host, not the UI host)

## Cron issues

- confirm the internal handler is exported
- confirm required env vars exist (DataGolf, email provider)
- ensure queries are indexed

See also:

- [../backend/cron-and-jobs.md](../backend/cron-and-jobs.md)
- [../backend/auth-and-identity.md](../backend/auth-and-identity.md)
