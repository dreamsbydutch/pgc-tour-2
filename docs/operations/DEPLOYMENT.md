# Deployment

> Purpose: release compatible PGC frontend and backend versions while keeping
> production changes explicit and recoverable. Sources of truth are
> [`package.json`](../../package.json), [`vite.config.ts`](../../vite.config.ts),
> [`vercel.json`](../../vercel.json), [`convex.json`](../../convex.json), and the
> generated-output patch in
> [`scripts/patch-vercel-function-runtime.mjs`](../../scripts/patch-vercel-function-runtime.mjs).
> Return to the [wiki index](../README.md).

## Authorization boundary

Building and reviewing a release is not authorization to deploy it. Do not:

- run `npm run convex:deploy` against production;
- trigger or promote a Vercel production deployment;
- run a production migration or repair;
- rotate production configuration; or
- send real email or push notifications

unless the user explicitly authorizes that external action and target.

## Deployment topology

```text
source
  -> Vite + TanStack Start + Nitro
       -> local/general output: .output/public + .output/server
       -> Vercel output: .vercel/output/static + functions/__fallback.func
  -> Convex schema/functions/crons (separate deployment)
  -> Clerk JWT issuer/template connects browser identity to Convex
```

Vercel serves the frontend/SSR runtime. Convex stores data and runs queries,
mutations, actions, schedules, and integrations. They must remain compatible
across independent deployments.

## Environment ownership

Verify values in the configured platform; never copy production values into
source, documentation, artifacts, or chat.

| Store                 | Expected configuration                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel browser build  | `VITE_CONVEX_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, optional PostHog variables                                                                              |
| Vercel/server runtime | `CLERK_SECRET_KEY` if required by the configured Clerk server runtime; repository ownership is not fully documented and must be confirmed before release |
| Convex deployment     | `CLERK_JWT_ISSUER_DOMAIN`, DataGolf and Brevo values, VAPID values, and `APP_BASE_URL`                                                                   |
| Clerk                 | Publishable/secret keys plus a Convex JWT template named `convex`                                                                                        |
| GitHub Actions        | Optional `CONVEX_DEPLOY_KEY` used for generated-code drift verification                                                                                  |

The repository does not document who owns these platform settings, which
Vercel project/environment maps to each branch, or who can promote a release.
Confirm those facts with an authorized operator; do not infer them from local
`.vercel` metadata or ignored environment files.

## Preview pull-request delivery

Use `$create-pgc-preview-pr` only when the user explicitly asks to deliver the
completed current goal as a GitHub/Vercel preview PR. That workflow creates a
sanitized `preview/<goal-slug>` branch, commits only proven in-scope agent work,
runs the final gate, pushes without force to `origin` unless the user names a
different delivery remote, and opens or updates one PR. `preview/` is a branch
namespace; it does not mean the repository's separate `preview` remote.

A preview URL is valid only when successful GitHub deployment, check, or commit
status metadata attributes the direct URL to the PR's exact head SHA. Never
guess it from branch, project, PR, or prior-deployment naming. If a branch push
does not trigger a preview, the workflow may open a draft PR to trigger the
configured integration, then add the verified URL. It marks the PR ready only
after the required gate passes or the user explicitly accepts a documented
exception. If GitHub still exposes no attributable direct preview, leave the PR
draft and report the external integration blocker.

A new or in-scope quality failure blocks delivery. A failure proven unchanged
from the fetched base may be documented in a draft PR alongside green focused
checks and a preview, but the PR remains draft until the required gate is green
or the user explicitly accepts the exception. Branch names, commit text, PR
copy, logs, and evidence are public metadata and must contain only display-safe
information.

This workflow does not prove who owns the external Vercel integration or which
events trigger it; it discovers actual behavior at delivery time. A preview PR
also does not authorize a production deployment, merge, Convex deploy, repair,
or environment change. Confirm which `VITE_CONVEX_URL` the preview uses before
treating it as backend compatibility evidence.

## Release sequence

1. Confirm the intended target and deployment authorization.
2. Inspect `git status --short` and release only the reviewed commit. Keep
   unrelated local work out of the release.
3. Run the full local gate:

   ```powershell
   npm run check
   ```

4. Confirm required environment values in Vercel, Convex, and Clerk without
   printing them.
5. If client/server compatibility spans releases, make the backend
   backward-compatible first. Avoid destructive schema cleanup in this phase.
6. Deploy the compatible Convex schema and functions only after explicit
   authorization:

   ```powershell
   npm run convex:deploy
   ```

7. Deploy the reviewed frontend through the configured Vercel project.

   **Repository gap:** there is no Vercel CLI script or GitHub deployment
   workflow, so the exact trigger and promotion steps are external and
   undocumented. Do not invent a command; ask the authorized operator.

8. Smoke-test the deployed origin:
   - sign-in and signed-out handling;
   - home dashboard;
   - tournament picks or current leaderboard;
   - standings, the current history placeholder, and rulebook;
   - account access;
   - member/moderator/admin authorization boundaries;
   - notification deep links when relevant.
9. Inspect recent `syncRuns`, `appState`, and relevant scheduled chains. Confirm
   the frontend points at the intended Convex deployment.
10. Remove temporary compatibility only in a later reviewed release after both
    sides are live and verified.

Use [Data repairs](DATA_REPAIRS.md) for any required backfill; a deployment does
not implicitly authorize one.

## Build and runtime outputs

`npm run build` runs `vite build`, then npm automatically invokes `postbuild`.
Locally, Nitro normally writes `.output/`, where:

- `.output/public/` contains public assets and the Vite manifest;
- `.output/server/index.mjs` is run by `npm start`.

In a Vercel-targeted build, Nitro writes `.vercel/output/`. The postbuild helper
recursively finds generated `.vc-config.json` files and sets their runtime to
`nodejs20.x`. If Vercel output is absent locally, the helper reports a skip.
When Vercel output exists, a patch failure is a deployment failure; do not
bypass the hook.

## Unresolved Node compatibility gap

Local development, CI, and `package.json` require Node 22 (`.nvmrc` pins
22.23.1), but the generated Vercel function is forcibly changed to
`nodejs20.x` by `scripts/patch-vercel-function-runtime.mjs`.

The repository does not explain why this override is required, which deployed
dependencies are verified on Node 20, or when it can be removed. Treat this as
an unresolved compatibility gap:

- do not silently change or remove the patch;
- do not claim production runs Node 22 while the patch remains;
- verify the generated Vercel runtime during release review; and
- resolve the requirement with the deployment owner before adopting Node
  22-only server APIs.

## Headers and CSP

`vercel.json` applies HSTS, content-type, referrer, permissions, and frame
protections globally. CSP is currently
`Content-Security-Policy-Report-Only` with explicit Clerk, Convex, PostHog,
Google Fonts, Cloudflare challenge, and image hosts.

Do not enforce CSP until framework and Clerk inline scripts receive a fresh
per-request nonce and deployed violations have been investigated. The current
configuration has no repository-defined reporting collector, so document how
violations were observed before changing the allowlist.

## Failure and recovery

| Failure                                | Response                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Local quality gate fails               | Stop the release and fix the earliest failure.                                                              |
| Convex deploy fails                    | Do not deploy a dependent frontend. Inspect the deployment error and preserve backward compatibility.       |
| Vercel build/postbuild fails           | Treat it as a failed release; do not bypass the runtime patch or security headers.                          |
| Deployed app shows missing-variable UI | Verify Vercel environment scope and redeploy; never hardcode a value.                                       |
| Frontend and backend are incompatible  | Prefer a backward-compatible backend correction, then redeploy the client. Avoid destructive schema action. |
| Scheduled work looks stale             | Inspect `syncRuns`, `appState`, leases, and the relevant job before manually retrying.                      |
| Result data is wrong                   | Stop automated assumptions; trace canonical source and downstream rebuild needs before repair.              |

### Rollback is not codified

There is no repository-owned rollback runbook for Vercel promotion, Convex
function rollback, or schema/data reversal. Do not improvise a destructive
rollback. Preserve a backward-compatible backend, collect the failing commit
and deployment identifiers, and ask the authorized deployment owner whether to
promote a previous Vercel deployment, ship a forward fix, or run a reviewed
data repair. Schema/data cleanup needs its own explicit plan and authorization.

See [Admin and automation](ADMIN_AND_AUTOMATION.md),
[Quality and testing](QUALITY_AND_TESTING.md), and
[Security, performance, and incidents](SECURITY_PERFORMANCE_AND_INCIDENTS.md).
