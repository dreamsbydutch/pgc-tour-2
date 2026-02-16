# Environment Variables

This project uses `.env.local` for local development.

## Required (local dev)

### Convex

- `CONVEX_DEPLOYMENT`
- `VITE_CONVEX_URL`

These are typically written for you by:

```bash
npx convex dev --configure
```

### Clerk

- `CLERK_SECRET_KEY` (server)
- `VITE_CLERK_PUBLISHABLE_KEY` (client)

### PostHog

- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`

## Convex environment variables

Convex functions/actions may also read variables configured in the Convex dashboard.

Common examples in this repo:

- `DATAGOLF_API_KEY` (used by DataGolf integration)

### Brevo (email)

Email actions use Brevo SMTP + template IDs configured in the Convex dashboard:

- `BREVO_API_KEY`
- `BREVO_TEST_TO`
- `BREVO_GROUPS_FINALIZED_TEMPLATE_ID`
- `BREVO_MISSING_TEAM_REMINDER_TEMPLATE_ID`
- `BREVO_SEASON_START_TEMPLATE_ID`

## Conventions

- Variables prefixed with `VITE_` are exposed to the browser.
- Do not place secrets in `VITE_*` vars.

## Deployment

- For Vercel: configure env vars in the Vercel project settings.
- For Convex: configure Convex-specific env vars in the Convex dashboard.

See:

- [deployment/environments.md](../deployment/environments.md)
- [deployment/vercel.md](../deployment/vercel.md)
- [deployment/convex-deploy.md](../deployment/convex-deploy.md)
