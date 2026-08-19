---
name: pgc-tournament-lifecycle
description: Explain, diagnose, test, or change PGC tournament state, appState timelines, pick and start schedules, grouping, preflight, adaptive live sync, syncRuns leases and retries, completion, and admin recovery. Use for when jobs run; provider parsing and scoring math use their own skills.
metadata:
  short-description: Operate the PGC tournament lifecycle
---

# PGC tournament lifecycle

Read the [tournament lifecycle](../../../docs/domain/TOURNAMENT_LIFECYCLE.md), [admin and automation runbook](../../../docs/operations/ADMIN_AND_AUTOMATION.md), and [integration architecture](../../../docs/architecture/INTEGRATIONS.md).

## Scope and handoffs

Own tournament timeline/status transitions, `appState`, exact pick/start scheduling, grouping and preflight orchestration, adaptive live-sync chaining, `syncRuns` leases and audit state, completion/finalization gating, recurring repair, and authenticated admin recovery.

- Use `$datagolf-api` or `$espn-golf-scorecards` for provider contracts, parsing, and identity.
- Use `$pgc-golf-scoring` for team totals, terminal states, ties, awards, and carryover.
- Use `$pgc-member-messaging` for reminders or final-result delivery.
- Use `$pgc-data-repairs` when persisted lifecycle state requires a migration or backfill.

## Preserve orchestration invariants

- Derive the public timeline from canonical season/tournament data and keep `appState` a small materialized view.
- Schedule exact boundaries from stored event times. Make callbacks self-gating so stale or duplicate schedules cannot advance the wrong tournament.
- Keep recurring, scheduled, and provider workflows internal; expose authenticated admin wrappers rather than public internal functions.
- Acquire bounded leases before work, finalize only the owned run, record skip/failure reasons, and make every retry idempotent.
- Keep grouping, pick-window preflight, active live sync, completion capture, standings refresh, and messaging in their documented order.
- Treat unchanged provider markers, partial feeds, completion holds, lost chain links, and corrected historical results as normal recoverable states.
- Do not run production admin operations, external sends, or repair actions without explicit authorization.

## Trace and verify

Trace `convex/crons.ts` and exact schedules in `convex/functions/readModels.ts` through `convex/functions/cronJobs.ts`, `convex/functions/syncRuns.ts`, `convex/functions/tournamentSyncState.ts`, canonical tournament/team writes, standings/read models, and admin UI.

Test exact time boundaries, stale scheduled callbacks, lease conflicts and expiry, unchanged markers, retries and caps, preflight gating, partial/mismatched provider data, broken-chain repair, first-place completion holds, finalization side effects, corrections, and manual-versus-scheduled idempotency.
