---
name: pgc-golf-scoring
description: Explain, diagnose, test, or change PGC golf scoring for gross strokes versus relative to par, live today or thru, counting-golfer averages, cuts and WD/DQ, ties, tier awards, and playoff carryover. Use for scoring math; provider transport and standings persistence use their own skills.
metadata:
  short-description: Diagnose PGC golf scoring
---

# PGC golf scoring

Read the canonical [scoring model](../../../docs/domain/SCORING.md) and [standings and playoffs](../../../docs/domain/STANDINGS_AND_PLAYOFFS.md). Compare league intent in `src/utils/rules.ts` with Convex code and tests; surface disagreements instead of silently choosing one.

## Label every value

Before calculating, identify the subject and scope, unit or representation, completeness, and provenance. Keep gross strokes, relative-to-par totals, averages, position, points, money, and status distinct. Keep missing distinct from even par and `thru` distinct from score.

## Scope and handoffs

Own golfer/team score meanings, round selection and averaging, live contribution, terminal states, position and tie calculations, tier awards, first-place resolution, and playoff carryover math.

- Use `$datagolf-api` or `$espn-golf-scorecards` for provider transport, validation, or identity.
- Use `$pgc-standings-read-model` for contribution persistence, history, season rows, movement, or qualification.
- Use `$pgc-financial-ledger` for member balances and settlement transactions.

## Preserve scoring invariants

- Select counting golfers independently for each round according to event and playoff rules.
- Round completed team averages at the documented boundary before accumulating tournament contributions.
- During live play, use the full counting denominator and do not shrink it for golfers without movement.
- Handle cut, withdrawal, disqualification, missing, partial, synthetic, and completed values explicitly.
- Treat carryover as an existing to-par baseline and add it once.
- Read points and payouts from tier data; they are outputs, not stroke units.
- A correction must propagate through positions, awards, standings, badges, and dependent read models.

## Trace and verify

Trace provider field to validation, tournament-golfer persistence, counting set, team round, tournament/playoff total, position, awards, standings, DTO, and formatted UI. Find the first boundary where meaning diverges.

Use hand-checkable focused tests for under/even/over par, partial and complete rounds, differing course par, event-specific counting sizes, rounding, terminal states, ties and earnings, corrections, and carryover. Assert stored numbers as well as labels.
