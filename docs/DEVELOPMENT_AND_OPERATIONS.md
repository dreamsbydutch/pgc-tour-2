# PGC Development and Operations

This guide covers the repeatable work required to develop, verify, deploy, and
operate PGC. League behavior belongs in
[LEAGUE_AND_APP_GUIDE.md](LEAGUE_AND_APP_GUIDE.md).

## Local development

Prerequisites:

- Node.js 20.19 or newer within Node 20 (`.nvmrc` pins 20.19.5)
- npm
- Access to the appropriate Convex and Clerk projects
- DataGolf, ESPN, Brevo, and PostHog access only when working on those features

Install and configure:

```bash
npm install
npx convex dev --configure
```

Run the frontend and Convex development process in separate terminals:

```bash
npm run dev
npm run convex:dev
```

The frontend is available at `http://localhost:3000`. Convex development also
regenerates `convex/_generated/` when server exports or the schema change.

## Configuration

Use `.env.local` for local frontend configuration. Never commit real
credentials. Copy `.env.example` to `.env.local` and fill only the values needed
for local development. Production values belong in the Vercel, Convex, and
Clerk secret stores; do not synchronize production environment files into the
repository or developer machines.

Browser-visible variables:

- `VITE_CONVEX_URL`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_POSTHOG_KEY` (optional)
- `VITE_POSTHOG_HOST` (optional)
- `VITE_POSTHOG_DEBUG` (optional; set to `true` only for explicit local debug)

`VITE_` values are bundled into the browser and must not contain secrets.

Convex environment variables:

- `CLERK_JWT_ISSUER_DOMAIN`
- `DATAGOLF_API_KEY`
- `BREVO_API_KEY`
- `BREVO_TEST_TO` for safe test sends
- `BREVO_GROUPS_FINALIZED_TEMPLATE_ID`
- `BREVO_WEEKLY_RECAP_TEMPLATE_ID` (optional; falls back to the groups template)
- `BREVO_MISSING_TEAM_REMINDER_TEMPLATE_ID`
- `BREVO_SEASON_START_TEMPLATE_ID`
- `APP_BASE_URL` for links in email; legacy fallbacks are
  `PUBLIC_APP_URL`, `SITE_URL`, and `VERCEL_URL`

Convex configuration belongs in the Convex deployment, not in browser
variables. Vercel needs the browser-visible variables for each deployed
environment.

## Commands and quality gate

`package.json` is authoritative. The common commands are:

| Command                  | Purpose                                    |
| ------------------------ | ------------------------------------------ |
| `npm run dev`            | Run the frontend development server        |
| `npm run convex:dev`     | Run Convex development and code generation |
| `npm test`               | Run Vitest once                            |
| `npm run typecheck`      | Check strict TypeScript                    |
| `npm run lint`           | Run ESLint                                 |
| `npm run format`         | Apply Prettier                             |
| `npm run build`          | Create the production build                |
| `npm run bundle:analyze` | Write the bundle-analysis JSON artifact    |
| `npm run bundle:budget`  | Enforce entry and async-route budgets      |
| `npm run check`          | Run the full release/CI quality pipeline   |
| `npm run convex:deploy`  | Deploy the Convex backend                  |

`npm run check` runs formatting, strict lint, typechecking, tests, the Convex
I/O guard, the production build, bundle analysis, and bundle budgets. CI keeps
each gate in a separate step, uploads `artifacts/bundle-analysis.json`, audits
dependencies, and runs CodeQL. Run the local gate before release and after broad
or league-sensitive changes.

Test the boundary that changed:

- League logic: cuts, withdrawals, score windows, ties, awards, standings, and
  playoff carryover.
- Convex writes: authentication, ownership, validation, idempotency, and
  downstream read models.
- Frontend hooks: loading/error states and derived view models.
- Display components: stable user-visible rendering, not internal
  implementation details.

## Deployment

The Convex backend and Vercel frontend are separate deployments.

1. Run `npm run check`.
2. Confirm production environment variables in both platforms.
3. Deploy compatible schema and Convex functions with
   `npm run convex:deploy`.
4. Deploy the frontend through Vercel.
5. Smoke-test sign-in, home, picks or leaderboard, standings, rulebook, and
   admin access.
6. Confirm scheduled jobs and recent `syncRuns` after deployment.

When an API or schema transition spans releases, make the backend
backward-compatible first, deploy it, then deploy the client. Remove temporary
compatibility only after both sides are live.

The production build runs `scripts/patch-vercel-function-runtime.mjs` after
Vite. Treat failures in that step as deployment failures rather than bypassing
the post-build hook.

## Scheduled and admin operations

Recurring schedules are defined in `convex/crons.ts`; exact-boundary schedules
are created from `convex/functions/readModels.ts`. The league lifecycle and
timings are summarized in the league guide.

Use the admin UI or authenticated public admin wrappers for manual work. Do not
make internal functions client-callable to simplify an operation.

Important operational records:

- `syncRuns` — lease ownership, trigger, status, duration, changed rows, and
  error/skip reason.
- `appState` — current public timeline and scheduled-chain markers.
- `espnIdentityAudit` — external identities needing safe operator resolution.
- `auditLogs` — sensitive entity changes.

## Data repair and migrations

Migration functions live in `convex/functions/migrations.ts`; materialized
read-model rebuilds live in `convex/functions/readModels.ts`.

For any repair:

1. Reproduce and validate it against a development deployment.
2. Make it bounded, restartable, and idempotent.
3. Require admin authorization for every public entry point.
4. Record before/after counts and sample affected rows.
5. Rebuild dependent state in order: tournament golfer data, teams/results,
   standings, badges/read models, then `appState`.
6. Run the repair in production once and inspect `syncRuns` or the returned
   cursor before continuing.

Never import raw production data into the repository, and never hand-edit
generated Convex types.

### Team metadata backfill

The index-backed tournament leaderboard requires every `teams` row to carry
`seasonId`, `tourId`, `memberId`, `displayName`, and `playoff` copied from its
tour card. Before enabling that leaderboard infrastructure in production:

1. Deploy `adminBackfillTeamMetadata` and
   `backfillTeamMetadataPageInternal` while the previous leaderboard read path
   remains compatible.
2. Run **Backfill Team Metadata** from the admin dashboard, or invoke the
   internal release-time mutation in bounded pages:

   ```bash
   npx convex run --prod functions/migrations:backfillTeamMetadataPageInternal \
     '{cursor:null,limit:200}'
   ```

3. Pass each returned `continueCursor` into the next invocation until `isDone`
   is `true`. Add the `scanned`, `updated`, `unchanged`, and `missingTourCards`
   totals across pages.
4. Investigate every missing tour card instead of inventing metadata. Verify a
   current tournament through `getPgcLeaderboard` for each tour.
5. Deploy the leaderboard changes that depend on the denormalized indexes.

The migration is idempotent and may be rerun. New teams and existing roster
updates populate the canonical metadata automatically.

### Full infrastructure data rebuild

When promoting the normalized scorecard, sync-state, and standings read-model
infrastructure, run the release-time mutations in this dependency order. Every
paginated function accepts `cursor` and `limit`; continue with the returned
`continueCursor` until `isDone` is `true`.

1. Snapshot tournament golfer identity with
   `functions/readModels:backfillTournamentGolfersPageInternal`.
2. Normalize tournament sync state with
   `functions/tournamentSyncState:migrateLegacyPageInternal`.
3. Copy embedded ESPN scorecards with
   `functions/espnGolf:migrateLegacyScorecardsPageInternal`.
4. Run `functions/standings:backfillSeasonPageInternal` for every season. This
   must finish before the final team snapshot pass because it recalculates tour
   card playoff assignments.
5. Run `functions/readModels:rebuildReadModelsPageInternal` to synchronize team
   metadata and exact tour registration counts.
6. Run `functions/readModels:rebuildMajorChampionBadgesInternal` once for every
   season, then run `functions/readModels:refreshAppState` with `{}`.
7. Verify source/snapshot equality, unique contribution and standings keys,
   exact tour counts, one sync-state row per tournament, and representative
   leaderboard/standings reads.
8. Only after verification, clear copied legacy fields with
   `functions/espnGolf:clearMigratedLegacyScorecardsPageInternal` and
   `functions/tournamentSyncState:clearMigratedLegacyPageInternal`.

If the team metadata pass reports missing tour cards, run
`functions/migrations:cleanupOrphanedTeamsPageInternal` with
`deleteRows:false` first. Investigate every result. A subsequent
`deleteRows:true` pass writes a full audit snapshot before deleting an orphan;
do not enable deletion until those exact rows have been reviewed.

Run these commands against development first. Add `--prod` only during the
approved production release, record the totals from every page, and rerun the
verification after legacy cleanup.

## Performance guardrails

- Use `.withIndex(...)` for recurring queries.
- Keep public hot-path reads bounded or paginated.
- Prefer one reusable screen read model to browser-side N+1 queries.
- Avoid unnecessary writes during live synchronization.
- Keep jobs self-gating and leased.
- Preserve the automated hot-query I/O check.
- Keep the largest client JavaScript chunk within the automated 537,000-byte
  budget unless the team deliberately establishes a new measured baseline.

For a performance release, compare equivalent tournament windows rather than
calendar days with different traffic. Review Convex function calls, database
read/write bandwidth, external egress, and p50/p95 duration. Do not add
per-request database telemetry that creates the I/O being measured.

## Security guardrails

- Derive user identity from `ctx.auth.getUserIdentity()`.
- Enforce member ownership and admin/moderator roles on the server.
- Keep cron, integration, and maintenance entry points internal.
- Return only display-safe member fields from public queries.
- Keep secrets out of `VITE_` variables, logs, fixtures, screenshots, and docs.
- Treat payments, account balances, roster ownership, email sends, and admin
  repairs as sensitive writes that require authorization and auditability.

### Release security checklist

- Confirm production frontend values exist in Vercel and server-only values
  exist in Convex or Clerk before deleting any synchronized local production
  environment files.
- After confirming production configuration, remove local `.env.production`
  and `.env.development` copies that contain production data. Rotate DataGolf,
  Brevo, and Clerk credentials because historical copies may have been synced.
- Keep npm on the HTTPS registry with strict certificate verification. Repair
  the local trust store if npm reports a certificate error; never set
  `strict-ssl=false`.
- Review weekly Dependabot pull requests, CodeQL alerts, and high-severity npm
  audit failures before releasing.

### Content Security Policy rollout

`vercel.json` currently sends `Content-Security-Policy-Report-Only`. The source
list covers the confirmed production/development Clerk and Convex hosts,
PostHog ingestion, Google Fonts, Clerk images, and the existing UploadThing
image host. Review browser CSP reports after deployment and explain every
violation before changing the policy.

Do not switch the header to enforced mode until inline framework and Clerk
scripts receive a fresh per-request nonce. Add that nonce to `script-src` and
the rendered script elements, then enforce without `unsafe-eval` or
`unsafe-inline` in `script-src`.

## Troubleshooting

### Missing Convex API exports or stale types

Run `npm run convex:dev` and let code generation complete. Do not edit
`convex/_generated/`.

### Authentication failures

Confirm the Clerk publishable key, Convex URL, Clerk Convex JWT template, and
`CLERK_JWT_ISSUER_DOMAIN`. Then confirm the authenticated Clerk subject maps to
exactly one member record.

### Incorrect or stale public screen

Check `appState`, the relevant bounded read-model query, and the latest
`publicVersion`. If a completed result changed, recompute standings and rebuild
the affected materialized views.

### Groups were not created

Inspect the latest `create_tournament_groups` run for an event-name mismatch,
missing DataGolf data, missing ranking data, or an existing lease. Confirm the
tournament is the next event and retry through the admin workflow.

### Live leaderboard stopped

Inspect `syncRuns`, `appState.liveSyncChainId`, the tournament status, external
feed timestamps, and the 30-minute repair job. Use the authenticated manual sync
only after checking for an active lease.

### Tournament will not complete

Check whether first place is tied. Completion is intentionally held if any
tied roster lacks golfer earnings or if combined roster earnings are still
equal.

### ESPN hole cards are missing

Check `espnIdentityAudit` before changing identity mappings. Resolve ambiguous
events or golfers explicitly; do not make the matcher guess.

### Email failed

Verify the Brevo key, template ID, recipient data, and `APP_BASE_URL`. Use the
single-recipient test workflow before any league-wide send.

### Stale browser assets

Hard-refresh and clear site data. In development, verify that an old service
worker is not still controlling the page.
