---
name: pgc-data-repairs
description: Design, review, test, or execute bounded PGC Convex migrations, backfills, cleanup, and read-model rebuilds with cursors, dry runs, idempotency, audits, and production safeguards. Use for stored-data transformation or repair; ordinary write-path fixes stay with the owning domain.
metadata:
  short-description: Run bounded PGC data repairs
---

# PGC data repairs

Read the [data repair runbook](../../../docs/operations/DATA_REPAIRS.md), the relevant domain page, and `convex/schema.ts` before designing a repair.

## Scope and authority

Own the mechanics of schema transitions, migrations, backfills, cleanup, verification, and dependent read-model rebuilds. The domain skill defines the desired state.

Diagnosing or implementing a repair does not authorize running it against production. Production deployment, invocation, or deletion requires explicit authority for the exact target.

## Design a safe repair

- State the broken invariant, authoritative source, target rows, scale, and downstream consumers.
- Fix the write path that caused the drift before repairing stored data.
- Use indexed, bounded pages with capped limits, cursors, completion state, and useful scanned/changed/unchanged/missing counts.
- Derive desired state so interrupted and repeated runs are safe. Avoid mutable pagination that can skip candidates.
- Keep public admin entry points authenticated; keep release-time internal entry points server-only.
- Default destructive cleanup to report-only, return exact candidates/reasons, and audit before deletion.
- Preserve backward compatibility across schema/client deployment order until parity is proven.

Rebuild only the affected dependency chain: canonical tournament data, teams/results, standings, badges/read models, then public timeline state.

## Trace and verify

Primary paths include `convex/functions/migrations.ts`, `convex/functions/readModels.ts`, `convex/functions/standings.ts`, `convex/functions/tournamentSyncState.ts`, `convex/functions/espnGolf.ts`, `convex/functions/syncRuns.ts`, `convex/schema.ts`, and their focused tests.

Run every page against a development deployment first, aggregate results to completion, then rerun to prove idempotency. Test authorization, page boundaries, cursor continuation, interruption/resume, duplicates, missing references, equality, dependent public reads, audit output, and safe delete gating. Stop on unexpected counts rather than guessing.
