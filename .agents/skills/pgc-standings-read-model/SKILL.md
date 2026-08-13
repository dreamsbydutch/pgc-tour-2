---
name: pgc-standings-read-model
description: Explain, diagnose, test, backfill, or change PGC standings contributions, materialized standings rows, competition ranks, position deltas, playoff qualification, history queries, and downstream rebuilds after corrected results.
---

# PGC standings read model

Read `docs/LEAGUE_AND_APP_GUIDE.md` before changing standings or qualification. Use `$golf-scoring-czar` when the upstream tournament result or award is in question.

## Preserve the model

```text
completed team result
  -> one standingsContribution per tourCard+tournament
  -> one regular standingsRow per tourCard+season
  -> tour ranks, movement, playoff level
  -> mirrored legacy tourCard totals
```

Treat team results as canonical, contributions as tournament snapshots/history, and rows as lean aggregates for hot reads. Upserts must skip unchanged snapshots and preserve unique logical keys.

## Apply the canonical formula

- Only completed regular-season tournaments contribute points, wins, top-five/top-ten finishes, made cuts, and appearances.
- Completed playoff earnings count toward total league earnings; playoff points and finishes do not alter regular-season standing.
- `pastPoints` removes the most recent completed regular contribution so movement compares equivalent snapshots.
- Rank cards within their tour by regular points. Equal point totals share competition rank (`Tn`) and skip subsequent occupied positions; do not invent an earnings, wins, or countback tiebreak.
- Deterministic name/ID sorting may stabilize processing but must not break equal-point competition rank.
- Derive playoff level from how many cards have strictly more points and the tour's `[gold, silver]` allocation. A tie across a boundary currently gives every tied card the same level.

## Refresh corrections completely

After a canonical team/tournament correction:

1. upsert the affected contribution;
2. recompute each affected card row;
3. recompute ranks, movement, and playoff levels for every affected season;
4. mirror the maintained aggregate fields to tour cards;
5. reconcile playoff teams and dependent badges/read models when the correction crosses those boundaries.

Upcoming or active events are not official standings inputs. Completion refreshes standings immediately; the maintenance job also recomputes daily at 04:00 UTC.

## Keep reads lean and repairs bounded

Use indexed `standingsRows` for standings screens and paginated contributions for history. Do not return roster arrays, private member identity, or raw source documents. Preserve the representative constraint that a 500-row standings response stays at or below 250 KiB and history pages cap at 50.

Backfill one season in bounded tour-card pages, upsert eligible tournament contributions, recompute each row, and recompute ranks only when the final page completes. Rerun to prove parity and idempotency; use `$pgc-data-repairs` for production execution.

Primary code is `convex/utils/standings.ts`, `convex/functions/standings.ts`, `teams.ts`, season standings queries, `convex/schema.ts`, and `convex/standingsReadModel.test.ts`.

Test canonical/materialized parity, completed versus active events, regular versus playoff contributions, equal-point ranks, past/current movement, qualification boundary ties, corrected results, unique contribution keys, backfill cursors/reruns, DTO privacy, pagination, and payload size.
