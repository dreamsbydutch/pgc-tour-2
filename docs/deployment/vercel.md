# Vercel Deployment

The frontend is deployed to Vercel.

## Build outputs

The repo uses TanStack Start with Vite.

- Build: `npm run build`
- Start server (Vercel output): `npm run start`

## Runtime pin

This repo includes a post-build script that patches Vercel function runtimes:

- Script: `scripts/patch-vercel-function-runtime.mjs`
- Hook: `npm run postbuild`

It scans `.vercel/output/functions/**/.vc-config.json` and sets:

- `runtime: "nodejs20.x"`

This matches the repo’s Node engine expectation.

## Environment variables

Set these in the Vercel project settings:

- `VITE_CONVEX_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_POSTHOG_KEY` (optional)
- `VITE_POSTHOG_HOST` (optional)

Server-only secrets should not be exposed via `VITE_*`.

See also:

- [environments.md](environments.md)
- [../getting-started/environment-variables.md](../getting-started/environment-variables.md)
