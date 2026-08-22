# Admin and automation

> Purpose: operate PGC's scheduled and manual workflows without bypassing
> authorization, leases, retry controls, or audit records. Sources of truth are
> [`convex/crons.ts`](../../convex/crons.ts),
> [`convex/functions/readModels.ts`](../../convex/functions/readModels.ts),
> [`convex/functions/cronJobs.ts`](../../convex/functions/cronJobs.ts), and the
> relevant domain function. Return to the [wiki index](../README.md).

## Authorization and execution rules

- Recurring, integration, and maintenance implementations remain Convex
  internal functions.
- Manual work goes through the admin UI or an authenticated public admin
  wrapper. Never make an internal function public merely to simplify an
  operation.
- A request to diagnose, implement, or document an operation does not authorize
  running it, especially in production.
- Before a manual retry, check for an active lease or scheduled successor.
- Jobs must be bounded, idempotent, retry-safe, leased where concurrent, and
  auditable when sensitive.

## Recurring schedule

Convex cron expressions use UTC.

| Job                                        | Schedule         | Responsibility                                                              |
| ------------------------------------------ | ---------------- | --------------------------------------------------------------------------- |
| `repair_live_tournament_sync_chain`        | Every 30 minutes | Restore a lost adaptive live-sync chain.                                    |
| `refresh_application_timeline`             | Every 15 minutes | Refresh `appState` and schedule exact pick/tournament boundaries.           |
| `refresh_next_tournament_opening_tee_time` | Every 30 minutes | During the four-day pick window, refresh the next event's opening tee time. |
| `publish_due_pick_reminders`               | Every 15 minutes | Publish due roster reminders with deduplication/preferences.                |
| `repair_notification_deliveries`           | Every 10 minutes | Release expired delivery leases and restart pending push delivery.          |
| `recompute_standings`                      | Daily at 04:00   | Recompute official standings from eligible completed results.               |
| `create_groups_for_next_tournament`        | Mondays at 17:00 | Build the next field/groups; retry protection lives in the workflow.        |
| `sync_golfer_directory_daily`              | Daily at 15:00   | Insert complete DataGolf identities, then refresh ranking metadata.         |

`refreshAppState` also schedules exact one-time work at the next pick-window
opening and tournament start. A changed opening tee time refreshes this state
and can start live sync immediately if the corrected boundary has passed.

## Adaptive live synchronization

The tournament-start chain claims ownership through `appState` and uses
`syncRuns` leases to avoid overlap. Delay selection is:

| State                          |                Next attempt |
| ------------------------------ | --------------------------: |
| Confirmed live play            |                   4 minutes |
| Tournament active but not live |                  12 minutes |
| Consecutive failure            | 8, then 16, then 30 minutes |
| No active work remains         |              Chain finishes |

The 30-minute repair cron is a safety net, not a second independent sync loop.
Inspect the active chain and lease before triggering a manual sync.

## Operational records

| Record                   | Use                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| `syncRuns`               | Job/run key, trigger, actor, lease, status, duration, changed rows, and error/skip reason.    |
| `appState`               | Public timeline, active/next event, pick window, public version, and scheduled-chain markers. |
| `tournamentSyncState`    | Per-event normalized sync status and failure state.                                           |
| `espnIdentityAudit`      | Ambiguous external event/golfer identities awaiting explicit resolution.                      |
| `auditLogs`              | Sensitive entity changes and destructive repair snapshots.                                    |
| `emailDispatchGuards`    | Email deduplication/dispatch protection.                                                      |
| `notificationDeliveries` | Push attempts, lease state, retry time, and terminal failures.                                |

Keep logs and returned results free of secrets and private member fields.

## Common manual workflows

The admin surface includes workflows for golfer-directory refresh, tournament
grouping, live synchronization, prior-event correction, standings recompute,
read-model rebuilds, settlement work, payments, messaging, and team import.
Availability and authorization come from the current admin code, not this
summary. `espnIdentityAudit` is observable data, but there is currently no
wired operator-resolution mutation or admin UI.

Before invoking one:

1. Confirm the actor and target environment.
2. Identify the canonical input and downstream consumers.
3. Inspect the latest related `syncRuns` record and active lease.
4. Prefer the authenticated admin workflow.
5. Record the returned counts/status and verify the affected public read.
6. If persisted canonical data changed, rebuild every dependent view in order.

Use an internal CLI entry point only when a documented release/repair procedure
requires it and the user has authorized the target. See
[Data repairs](DATA_REPAIRS.md).

## Failure and recovery

### Groups were not created

Inspect the latest `create_tournament_groups` run for:

- an event-name mismatch;
- missing DataGolf field or ranking data;
- a non-next tournament;
- an existing lease; or
- exhausted hourly retry attempts.

Confirm the target event, then retry through the admin workflow. Do not weaken
identity or event matching.

### Live leaderboard stopped

Check `syncRuns`, `appState.liveSyncChainId`, scheduled tournament/start
markers, `tournamentSyncState`, tournament status, feed timestamps, and the
30-minute repair job. Use the authenticated manual sync only after confirming
there is no active lease.

### Opening tee time or picks boundary is stale

Inspect the `tournament_preflight` run and current field feed. Outside the
four-day pick window, its database-only skip is expected. When a boundary
changes, verify `appState` was refreshed and exact-boundary work rescheduled.

### Standings or public views are stale

Confirm the source result is canonical, inspect `publicVersion`, and recompute
standings before rebuilding dependent badges/read models. Do not patch a
display row as a substitute for repairing its source.

### Push delivery is stuck

Inspect pending/processing deliveries, `nextAttemptAt`, attempts, and lease
expiry. The repair cron processes bounded batches. HTTP 404/410 expires the
subscription; 429/5xx responses retry with backoff. Do not repeatedly invoke a
delivery action around its lease.

### Email failed

Verify the Brevo key, template ID, recipient data, dispatch guard, and
`APP_BASE_URL`. Use the single-recipient `BREVO_TEST_TO` workflow before a
league-wide send. Diagnosis does not authorize a real send.

### Identity is ambiguous

Inspect `espnIdentityAudit` and the saved provider mappings. There is no wired
operator-resolution workflow today; preserve the ambiguity and escalate a
scoped implementation rather than editing data or making the matcher guess.

## Known operational gaps

The repository does not define on-call ownership, alert destinations, SLOs, or
automatic escalation for failed jobs. Until those exist, record which
deployment, job name, run ID, event, and time window were inspected and hand the
incident to the authorized operator.

See [Deployment](DEPLOYMENT.md) and
[Security, performance, and incidents](SECURITY_PERFORMANCE_AND_INCIDENTS.md).
