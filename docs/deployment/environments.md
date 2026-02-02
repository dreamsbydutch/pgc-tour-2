# Environments (Dev / Prod)

This project has two categories of configuration:

- Frontend environment variables (Vite `import.meta.env`)
- Convex environment variables (available to Convex functions/actions)

## Local

- `.env.local` holds local frontend + server values.
- `npx convex dev --configure` will usually populate Convex values needed for local.

## Vercel

Vercel environment variables should include:

- `VITE_CONVEX_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_POSTHOG_KEY` (optional)
- `VITE_POSTHOG_HOST` (optional)

## Convex

Convex environment variables should include:

- `CLERK_JWT_ISSUER_DOMAIN`
- `DATAGOLF_API_KEY` (if DataGolf features are used)
- email provider keys used by the email utilities (if enabled)

## Rule of thumb

- If it starts with `VITE_`, it is exposed to the browser.
- Keep secrets in Convex/Vercel server env vars, not in `VITE_*`.

See also:

- [vercel.md](vercel.md)
- [convex-deploy.md](convex-deploy.md)
- [../getting-started/environment-variables.md](../getting-started/environment-variables.md)
