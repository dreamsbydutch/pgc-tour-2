---
name: pgc-standings-read-model
description: Explain, diagnose, test, backfill, or change PGC standings contributions, aggregate rows, history, competition ranks, movement, playoff qualification, and refresh after corrected results. Use for standings persistence and queries; scoring math and repair execution use their own skills.
metadata:
  short-description: Maintain the PGC standings model
---

# PGC standings read model

Read [standings and playoffs](../../../docs/domain/STANDINGS_AND_PLAYOFFS.md), [scoring](../../../docs/domain/SCORING.md), and the [data repair runbook](../../../docs/operations/DATA_REPAIRS.md) before backfill execution.

## Scope and handoffs

Own canonical standings contributions, materialized season rows, history queries, competition rank and movement, playoff qualification, legacy aggregate mirrors, and standings refresh after corrected results.

- Use `$pgc-golf-scoring` when the upstream team score, position, points, or award is disputed.
- Use `$pgc-data-repairs` for paged execution, production safeguards, or cleanup mechanics.
- Use `$pgc-registration-and-picks` for roster submission and inheritance.

## Preserve the read model

Completed team results are canonical; one contribution snapshots each eligible card/tournament result; one row aggregates each card/season for hot reads.

- Include only domain-eligible completed results and keep regular-season and playoff effects distinct.
- Preserve competition ranking for equal points; deterministic processing order must not invent a tiebreak.
- Derive movement from equivalent snapshots and qualification from current regular points and configured allocations.
- Skip unchanged upserts and preserve unique logical keys.
- After a correction, refresh contributions, rows, ranks, movement, qualification, legacy mirrors, and dependent playoff teams/badges/read models.
- Keep public standings DTOs indexed, bounded, display-safe, and free of rosters or private member identity.

## Trace and verify

Trace completed team result through `convex/utils/standings.ts`, `convex/functions/standings.ts`, team completion, season queries, `convex/schema.ts`, and downstream consumers.

Test canonical/materialized parity, active versus completed events, regular versus playoff effects, equal-point ranks, movement, qualification-boundary ties, corrected results, unique keys, cursor/rerun behavior, DTO privacy, pagination, and payload budgets.
