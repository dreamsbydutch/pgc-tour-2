# Security, performance, and incidents

> Purpose: preserve PGC's trust, responsiveness, and recoverability during
> development and operations. Sources of truth are
> [`AGENTS.md`](../../AGENTS.md), [`eslint.config.js`](../../eslint.config.js),
> [`vercel.json`](../../vercel.json), [CI workflows](../../.github/workflows),
> [`convex/schema.ts`](../../convex/schema.ts), and the affected implementation.
> Return to the [wiki index](../README.md).

## Security invariants

- Derive identity from `ctx.auth.getUserIdentity()` and resolve the member on
  the server. Never trust a client-supplied Clerk ID, member ID, ownership
  claim, or role.
- Enforce member ownership and admin/moderator permissions in public Convex
  operations. Keep scheduled, integration, and maintenance implementations
  internal.
- Validate every public argument and expose only display-safe DTO fields.
- Store money as integer cents. Treat balances, transactions, settlements,
  roster ownership, email sends, and admin repairs as sensitive writes requiring
  authorization and auditability.
- Keep secrets and member data out of source, logs, fixtures, screenshots,
  artifacts, documentation, and chat. `VITE_` variables are public.
- Use development deployments for tests and investigations. Never import
  production exports into the repository.
- Do not deploy, mutate/repair production, or send real messages without
  explicit authorization.

Automated protections include strict TypeScript, architectural ESLint rules,
the Convex public-I/O guard, dependency audit/review, full-history Gitleaks, and
CodeQL. See [Quality and testing](QUALITY_AND_TESTING.md) for their scope and
limitations.

## Content security policy

`vercel.json` applies HSTS, `nosniff`, strict referrer policy, disabled
camera/microphone/geolocation, and frame denial. CSP remains report-only and
allows the configured Clerk/Convex hosts, Cloudflare challenges, PostHog,
Google Fonts, and the existing image host.

Do not switch CSP to enforcement until inline framework and Clerk scripts have
a fresh per-request nonce. Investigate every observed violation before changing
the source list. No reporting collector is defined in the repository, so do
not claim centralized CSP telemetry without confirming the deployed platform.

## Secret or private-data exposure

1. Stop copying, logging, or propagating the value.
2. Preserve the affected path/commit and scope without repeating the secret.
3. Notify the authorized owner and rotate the exposed credential in its source
   platform. Potential credentials include Clerk, Convex deploy, DataGolf,
   Brevo, PostHog, and VAPID keys.
4. Remove the value from current source/artifacts and add a safe placeholder.
5. Use the repository secret scan to assess history. Do not rewrite shared Git
   history without explicit coordination and authorization.
6. Reverify the least-privilege environment mapping after rotation.

Ignored `.env.production` or `.env.development` files can still be copied or
synced outside Git. Delete local production copies only after confirming the
real platform configuration and coordinating credential rotation.

## Performance invariants

- Use indexed, bounded reads. Avoid unbounded `.collect()` on public or
  recurring paths.
- Prefer one screen-oriented DTO/read model over browser-side joins or N+1
  subscriptions.
- Keep public/private viewer data separated so public subscriptions remain
  cacheable and viewer-independent.
- Keep jobs bounded, self-gating, leased, idempotent, and light on unnecessary
  writes.
- Avoid expensive render loops, oversized subscriptions, continuous animation,
  and new initial-bundle dependencies.
- Preserve the automated 537,000-byte main-entry, 165-KiB initial-gzip, and
  60-KiB async-route budgets.

For a performance release, compare equivalent tournament phases. Review Convex
function calls, read/write bandwidth, external egress, payload sizes, and
p50/p95 duration. Do not add per-request database telemetry that creates the
I/O being measured. The static I/O check is a regression tripwire, not a
production profiler.

## Incident response boundary

Read-only diagnosis is allowed when it stays within the requested systems.
Changing production state, configuration, schedules, data, or recipients needs
explicit authorization.

For any incident:

1. Identify environment, deployment/commit, affected event/season/tour, and
   first known bad time.
2. Preserve evidence: error text, function/job name, `syncRuns` ID, status,
   counts, timestamps, and affected public version. Do not include secrets or
   unnecessary member data.
3. Determine whether the source is configuration, canonical data, a materialized
   view, an external feed, or frontend presentation.
4. Check leases and scheduled successors before manually retrying work.
5. Prefer a backward-compatible forward fix. Use a reviewed repair only when
   persisted state is wrong.
6. Verify every downstream consumer and record the recovery result.

The repository does not define on-call ownership, alert channels, incident
severity, SLOs, or a production rollback owner. Escalate those decisions rather
than inventing them.

## Symptom guide

| Symptom                       | First checks                                                                                       | Safe next step                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Authentication failure        | Clerk publishable key, Convex URL, `convex` JWT template, issuer domain, and unique member mapping | Correct configuration in the owning platform and redeploy/restart; do not weaken auth.   |
| Missing Convex API export     | `convex/_generated`, current schema/exports, development deployment                                | Let `npm run convex:dev` regenerate; never edit generated files.                         |
| Incorrect/stale public screen | `appState`, `publicVersion`, canonical source row, bounded read model                              | Recompute/rebuild from the source after authorization.                                   |
| Groups not created            | `create_tournament_groups` run, event-name match, DataGolf field/rankings, lease                   | Retry through authenticated admin workflow after resolving the cause.                    |
| Live leaderboard stopped      | Live chain markers, `syncRuns`, `tournamentSyncState`, feed timestamps, repair cron                | Wait for/verify repair or invoke authenticated manual sync only without an active lease. |
| Tournament will not complete  | First-place tie and earnings completeness for all tied rosters                                     | Correct missing canonical earnings; never force a guessed winner.                        |
| ESPN hole cards missing       | `espnIdentityAudit`, event and golfer mappings, partial rounds                                     | Resolve identity explicitly; do not loosen matching.                                     |
| Email failed                  | Brevo key/template, recipient data, dispatch guard, `APP_BASE_URL`                                 | Use the single-recipient test workflow before an authorized broad send.                  |
| Push failed                   | VAPID values, subscription status, delivery attempts/lease, HTTP status                            | Let retry/repair semantics run; expire 404/410 subscriptions.                            |
| Stale browser behavior        | Deployed asset version, hard refresh, site data, service-worker registration                       | Clear site data if appropriate. The service worker handles push, not app-shell caching.  |
| npm certificate error         | Local trust store and `.npmrc`                                                                     | Repair trust; never set `strict-ssl=false`.                                              |

## External-data discipline

DataGolf is authoritative for field/ranking/live tournament data used by PGC;
ESPN scorecards are supplemental. Missing, partial, delayed, duplicate, and
corrected feeds are normal failure modes. Persist provider identity, keep event
and golfer matching explicit, and rebuild downstream results after a canonical
correction. Do not hide uncertainty in a display-only patch.

See [Admin and automation](ADMIN_AND_AUTOMATION.md),
[Data repairs](DATA_REPAIRS.md), [Deployment](DEPLOYMENT.md), and the relevant
domain wiki page before changing league-affecting behavior.
