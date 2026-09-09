# Local development

> Purpose: set up and run PGC locally without touching production data or
> services. The command source of truth is [`package.json`](../../package.json);
> runtime and environment behavior is defined by [`.nvmrc`](../../.nvmrc),
> [`.env.example`](../../.env.example), [`vite.config.ts`](../../vite.config.ts),
> and [`convex.json`](../../convex.json). Return to the
> [wiki index](../README.md).

## Safety boundary

- Use a development Convex deployment. Never point experiments at production
  or import a production export into the repository.
- Do not send real email or push notifications unless the user explicitly asks
  for that external action.
- `.env.local`, `.env.development`, and `.env.production` are ignored because
  they may contain secrets. Never quote their values in logs, screenshots,
  fixtures, documentation, or chat.
- `VITE_` variables are compiled into browser code and must never contain a
  secret.
- Reuse an existing development server when practical. Track and stop only a
  process you started.

## Prerequisites

- Node.js `>=22.12.0 <23`; `.nvmrc` pins `22.23.1`.
- npm and the committed v3 lockfile.
- Access to the project's development Convex and Clerk configuration.
- DataGolf, ESPN, Brevo, PostHog, or web-push access only for work that uses
  that integration.

For a clean checkout, install the exact locked dependency graph:

```powershell
npm ci
```

Use `npm install` when intentionally changing dependencies or when a local
development workflow needs to update the lockfile. Do not weaken `.npmrc`'s
HTTPS registry or strict certificate verification to work around a trust-store
problem.

## Configure a development deployment

Copy `.env.example` to `.env.local` only if the local file does not already
exist, then fill the minimum values required for the current task. First-time
Convex setup is:

```powershell
npx convex dev --configure
```

That command selects/configures a development deployment and may remain
running. Do not choose production for local testing.

Environment ownership is split deliberately:

| Consumer                 | Variables                                                                                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Local Convex selection   | `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`                                                                                          |
| Browser bundle           | `VITE_CLERK_PUBLISHABLE_KEY`; optional `VITE_POSTHOG_KEY`, `VITE_POSTHOG_HOST`, and local-only `VITE_POSTHOG_DEBUG`             |
| Clerk/server integration | `CLERK_SECRET_KEY`, where required by the configured Clerk runtime                                                              |
| Convex authentication    | `CLERK_JWT_ISSUER_DOMAIN`; Clerk must also expose a JWT template named `convex`                                                 |
| Convex integrations      | `DATAGOLF_API_KEY`, Brevo template/test variables, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, and `APP_BASE_URL` |

`.env.example` documents names and visibility, not production ownership. Store
production values in the configured Vercel, Convex, Clerk, and GitHub secret
stores as applicable; see [Deployment](DEPLOYMENT.md).

## Run the app

Use separate terminals:

```powershell
npm run convex:dev
```

```powershell
npm run dev
```

The frontend is available at `http://localhost:3000`. The script includes
Vite's `--host` flag, so it can listen beyond loopback; use only development
credentials and do not expose it to an untrusted network.

`npm run convex:dev` watches backend exports and the schema and regenerates
`convex/_generated/`. TanStack's development/build tooling regenerates
`src/routeTree.gen.ts`. Both generated areas are committed but must never be
hand-edited.

For production-like local output:

```powershell
npm run build
npm start
```

`npm start` runs `.output/server/index.mjs`. `npm run serve` instead runs Vite's
preview server. Build output is ignored and may be replaced at any time.

## Navigate the repository

Start every change by checking the worktree:

```powershell
git status --short
```

Prefer fast, scoped searches:

```powershell
rg --files src convex docs
rg -n "search term" src convex docs
```

Follow the normal dependency path when tracing a screen:

```text
src/routes -> src/components -> src/hooks -> typed Convex operation
                                      -> convex/functions -> indexed schema data
```

Useful starting points:

| Question                                               | Start here                                            |
| ------------------------------------------------------ | ----------------------------------------------------- |
| URL, search state, or page assembly                    | `src/routes/`                                         |
| Rendering or local presentation state                  | `src/components/`                                     |
| Frontend queries, mutations, workflows, or view models | `src/hooks/`                                          |
| Pure calculation                                       | `src/utils/`                                          |
| Shared frontend shape                                  | `src/types/`                                          |
| Server operation                                       | `convex/functions/`                                   |
| Persisted fields or index                              | `convex/schema.ts`                                    |
| Recurring schedule                                     | `convex/crons.ts`                                     |
| League intent                                          | `src/utils/rules.ts` and the league/domain wiki pages |

Do not add new general logic to legacy `src/lib/`, and import components through
`@/ui`, `@/displays`, `@/widgets`, or `@/facilitators`.

## Common recovery

| Symptom                               | Check or action                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing Convex exports or stale types | Let `npm run convex:dev` finish code generation; never patch `_generated` manually.                                                                  |
| Missing-variable screen               | Confirm `VITE_CONVEX_URL` and `VITE_CLERK_PUBLISHABLE_KEY` in the active local environment, then restart Vite.                                       |
| Authentication fails                  | Confirm the Clerk key, Convex URL, `convex` JWT template, issuer domain, and one-to-one Clerk subject/member mapping.                                |
| Port 3000 is occupied                 | Identify and reuse the existing project server; do not kill an unknown process.                                                                      |
| Stale browser behavior                | Hard-refresh, clear site data if needed, and inspect service-worker registration. `public/sw.js` handles push; it is not an application asset cache. |
| npm certificate failure               | Repair the machine trust store; never set `strict-ssl=false`.                                                                                        |

See [Quality and testing](QUALITY_AND_TESTING.md), the
[command reference](../reference/COMMANDS.md), and
[Security, performance, and incidents](SECURITY_PERFORMANCE_AND_INCIDENTS.md)
before broad changes.
