---
name: pgc-data-repairs
description: Design, review, test, or run PGC Convex migrations, backfills, cleanup jobs, and materialized read-model repairs. Use for cursors, dry runs, idempotency, admin operations, dependency ordering, legacy-field cleanup, or development/production repair plans.
---

# PGC data repairs

Read `docs/DEVELOPMENT_AND_OPERATIONS.md` and the affected schema/domain code before working on a repair. Diagnosing or implementing a repair does not authorize running it against production.

## Design a safe repair

1. State the broken invariant, authoritative source, target rows, expected scale, and downstream consumers.
2. Fix the write path that broke the invariant before repairing stored data. Convex indexes accelerate lookups but do not enforce logical uniqueness.
3. Use an indexed, bounded page with `cursor` and capped `limit`; return `continueCursor`, `isDone`, and scanned/changed/unchanged/missing counts.
4. Make reruns safe: derive the desired state, skip unchanged rows, and never depend on a previous invocation completing. If writes can reorder or remove rows in the paginated index, discover into a bounded candidate manifest first or scan an immutable keyspace so cursors cannot skip work.
5. Keep the public admin entry point authenticated. Use a separate internal entry point only for approved release-time CLI execution.
6. For destructive cleanup, default to report-only. Return exact candidate IDs/reasons, require an explicit delete flag, and write an audit snapshot before deletion.
7. Treat missing parents, duplicate canonical keys, and impossible mappings as investigation results, not data to guess around.
8. Keep schema/client transitions backward-compatible across deployment order; remove compatibility only after source/target parity is verified.

## Rebuild in dependency order

Use the smallest applicable cascade:

```text
tournament golfer identity/performance
  -> teams and tournament results
  -> standings contributions and rows
  -> badges and other read models
  -> appState/public timeline
```

For the normalized infrastructure migration, preserve the maintained order: tournament-golfer snapshots, tournament sync state, ESPN scorecards, standings by season, team/read-model metadata, badges, then `appState`. Clear copied legacy fields only after equality and uniqueness checks pass.

## Validate before production

- Reproduce and run every page against a development Convex deployment first.
- Record before/after counts and representative rows; run to `isDone`, aggregate totals, then rerun to prove idempotency.
- Test authorization, page boundaries, cursor continuation, unchanged rows, missing references, duplicate prevention, and interrupted/resumed execution.
- Verify source/snapshot equality, unique indexes or logical keys, dependent public reads, and `syncRuns`/audit output where applicable.
- Never import raw production exports into the repo or hand-edit generated Convex files.

Run production only when explicitly authorized. Resolve the deployment and exact function, start with a small page, record every cursor/result, stop on unexpected counts, and use `--prod` only for the approved invocation. Do not combine a migration, destructive cleanup, and unrelated schema change into one opaque operation.

Primary locations are `convex/functions/migrations.ts`, `readModels.ts`, `standings.ts`, `tournamentSyncState.ts`, `espnGolf.ts`, `syncRuns.ts`, `convex/schema.ts`, and `convex/migrations.test.ts`.
