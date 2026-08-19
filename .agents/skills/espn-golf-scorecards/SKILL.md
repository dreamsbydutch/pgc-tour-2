---
name: espn-golf-scorecards
description: Trace, diagnose, test, or change PGC's best-effort ESPN golf scorecard parsing, event or golfer matching, partial and corrected cells, audits, merging, synthesis, and team hole displays. Do not use for authoritative tournament totals or DataGolf ingestion.
metadata:
  short-description: Maintain ESPN golf scorecards
---

# ESPN golf scorecards

Read the [integration architecture](../../../docs/architecture/INTEGRATIONS.md), [admin and automation runbook](../../../docs/operations/ADMIN_AND_AUTOMATION.md), and the [scoring model](../../../docs/domain/SCORING.md). Use `$pgc-golf-scoring` whenever score units or team denominators are involved.

## Scope and authority

Own the unofficial ESPN hole-cell fetch, defensive parser, event/golfer identity reconciliation, scorecard merge, audits, and PGC-only hole display transformations.

ESPN must never block or overwrite DataGolf-owned tournament totals, status, finish, earnings, or points. Synthetic holes repair display completeness only.

## Preserve the pipeline

- Fetch the local tournament's start date from `https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard` in a Convex internal action; do not use today's date.
- Parse responses as `unknown` and preserve valid siblings when one event, competitor, round, or hole is malformed.
- Keep DataGolf golfer IDs distinct from persisted ESPN IDs. Prefer saved mappings and reject ambiguous or conflicting matches rather than guessing.
- Merge by tournament, golfer, round, and hole. Corrections replace the same cell; omissions preserve stored cells, including partial WD/DQ cards.
- Normalize ordering before equality checks and keep writes bounded.
- Run ESPN only as a best-effort consequence of a successful or unchanged DataGolf sync.

## Trace and verify

Trace `convex/functions/espnGolf.ts`, `convex/utils/espnGolf.ts`, `convex/types/espnGolf.ts`, `convex/schema.ts`, and `src/utils/teamHoleScorecard.ts`.

Use sanitized fixtures, never captured member or production data. Cover malformed nested payloads, simultaneous events, accents and aliases, ambiguous identities, corrections, omitted cells, deterministic equality, WD/DQ synthesis, team denominators/completion, and the invariant that ESPN writes no DataGolf-owned score field.
