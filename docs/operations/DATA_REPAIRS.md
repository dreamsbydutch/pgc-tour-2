# Data repairs

> Purpose: correct persisted or materialized PGC state with bounded,
> restartable, reviewable operations. Sources of truth are
> [`convex/functions/migrations.ts`](../../convex/functions/migrations.ts),
> [`convex/functions/readModels.ts`](../../convex/functions/readModels.ts), the
> affected domain function, [`convex/schema.ts`](../../convex/schema.ts), and
> focused tests. The repository skill
> [`pgc-data-repairs`](../../.agents/skills/pgc-data-repairs/SKILL.md) adds the
> required workflow. Return to the [wiki index](../README.md).

## Authorization boundary

- Diagnosing, designing, implementing, or testing a repair does not authorize
  running it.
- Test against a development Convex deployment first.
- Add `--prod` only for the exact operation and deployment explicitly approved
  by the user.
- Default destructive cleanup to report-only. Review exact candidate IDs and
  reasons before a separate authorized delete pass.
- Never import raw production data into the repository or hand-edit generated
  Convex types.

## Repair contract

Before implementation, state:

- the broken invariant and authoritative source;
- the target rows and expected scale;
- why the normal write path allowed the problem;
- downstream consumers/materialized views;
- dry-run or report-only behavior;
- cursor, page-size cap, and resume behavior;
- counts and samples that prove success; and
- how partial completion or failure is recovered.

Fix the write path before repairing stored rows. A safe page returns a
`continueCursor`, `isDone`, and useful scanned/changed/unchanged/missing totals.
Rerunning it must derive desired state and skip already-correct rows.

If writes can reorder or delete entries in the paginated index, first discover
a bounded candidate manifest or scan an immutable keyspace so a cursor cannot
skip rows. Convex indexes speed access but do not enforce logical uniqueness.

## Standard workflow

1. Reproduce and test the invariant against development data.
2. Add or confirm focused authorization, validation, idempotency, and downstream
   tests.
3. Run a development page and inspect counts and representative rows.
4. Continue with each returned cursor until `isDone` is `true`.
5. Rebuild dependent state in canonical order.
6. Verify source/snapshot equality and representative public queries.
7. Obtain explicit production authorization.
8. Run one production page, record the result, and reassess before continuing.
9. Preserve the final totals, deployment, function name, time, and any missing
   or ambiguous rows for audit.

PowerShell accepts the JSON argument on one line. Generic development shape:

```powershell
npx convex run functions/module:functionName '{"cursor":null,"limit":200}'
```

Approved production shape:

```powershell
npx convex run --prod functions/module:functionName '{"cursor":null,"limit":200}'
```

Do not use Bash `\` line continuation in PowerShell. Function names and
arguments must come from the current code; do not infer them from this generic
pattern.

## Dependency order

For a correction that reaches public standings, the normal rebuild direction
is:

```text
tournament golfer identity/performance
  -> tournament sync state and scorecards
  -> teams and canonical results
  -> standings contributions and standings rows
  -> team/read-model metadata and counts
  -> badges
  -> appState/publicVersion
```

Only run applicable stages, but never update a downstream snapshot while
leaving its authoritative parent wrong.

## Team metadata backfill

The indexed tournament leaderboard expects every team to carry `seasonId`,
`tourId`, `memberId`, `displayName`, and `playoff` copied from its tour card.
The existing bounded internal command is:

```powershell
npx convex run --prod functions/migrations:backfillTeamMetadataPageInternal '{"cursor":null,"limit":200}'
```

Use it only during an approved production release. Pass each returned
`continueCursor` into the next invocation until done, sum `scanned`, `updated`,
`unchanged`, and `missingTourCards`, and investigate every missing tour card.
Verify `getPgcLeaderboard` for a current tournament in every tour before
deploying a read path that depends on the denormalized indexes.

The migration is idempotent. New writes maintain this metadata through the
normal team/tour-card path.

## Full infrastructure rebuild

When promoting normalized scorecards, sync state, and standings read models,
run bounded pages in this order:

1. `functions/readModels:backfillTournamentGolfersPageInternal`
2. `functions/tournamentSyncState:migrateLegacyPageInternal`
3. `functions/espnGolf:migrateLegacyScorecardsPageInternal`
4. `functions/standings:backfillSeasonPageInternal` for every season
5. `functions/readModels:rebuildReadModelsPageInternal`
6. `functions/readModels:rebuildMajorChampionBadgesInternal` for every season
7. `functions/readModels:refreshAppState` with `{}`
8. Verify equality, logical uniqueness, counts, sync state, and representative
   leaderboard/standings reads.
9. Only after verification, clear copied legacy fields with
   `functions/espnGolf:clearMigratedLegacyScorecardsPageInternal` and
   `functions/tournamentSyncState:clearMigratedLegacyPageInternal`.

Standings must finish before the final team snapshot pass because recomputation
can change tour-card playoff assignment.

If team metadata reports missing tour cards, first run
`functions/migrations:cleanupOrphanedTeamsPageInternal` with
`deleteRows:false`. Investigate every row. A separately authorized
`deleteRows:true` pass must write a full audit snapshot before deletion.

## Failure and recovery

| Condition                              | Response                                                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Page fails before returning            | Inspect logs/result and rerun the same page only after confirming idempotency and lease state.                      |
| Some pages completed                   | Resume from the last successfully returned cursor; retain cumulative totals.                                        |
| Cursor may skip reordered/deleted rows | Stop and redesign around an immutable scan or candidate manifest.                                                   |
| Missing parent or ambiguous identity   | Return/report it for investigation; never invent the relationship.                                                  |
| Counts differ after rebuild            | Keep legacy fields, compare canonical and snapshot rows, and do not continue cleanup.                               |
| Wrong production mutation ran          | Stop further pages, preserve evidence and audit data, and escalate; the repository has no generic rollback command. |

A repair is complete only when the write path is fixed, all required pages and
downstream rebuilds finish, verification passes, and the operation is recorded.

See [Admin and automation](ADMIN_AND_AUTOMATION.md),
[Deployment](DEPLOYMENT.md), and
[Security, performance, and incidents](SECURITY_PERFORMANCE_AND_INCIDENTS.md).
