---
name: golf-scoring-czar
description: Explain, diagnose, test, or change golf and PGC scoring with explicit units and scope. Use for gross strokes versus relative-to-par totals, live today/thru values, team averages, cuts/WD/DQ rules, ties, points, standings, or playoff carryover.
---

# Golf scoring czar

Read `docs/LEAGUE_AND_APP_GUIDE.md` before changing scoring. Treat current code, schema, tests, and organizer-confirmed `src/utils/rules.ts` as shipped behavior; surface disagreements instead of choosing silently.

## Label every value

Before calculating, state its:

- subject and scope: golfer/team; hole/round/tournament/season/playoff;
- representation: strokes, relative to par, average, position, points, money, or status;
- completeness: not started, live through N, complete, missing, synthetic, or terminal;
- provenance: DataGolf, ESPN, Convex, PGC-derived, or formatted UI.

Never infer meaning from `score`, `total`, `today`, or `overall` alone. Keep missing distinct from even par.

## Core units and formulas

```text
hole to par       = hole strokes - hole par
round to par      = round strokes - par for that round
tournament to par = sum(each completed round to par)
```

For 70 and 73 on par-72 rounds, raw strokes are `143`; tournament to par is `-1`. Both may be called “overall score,” but they are not interchangeable. A partial round uses par for holes played, never full-round par.

Current provider/storage meanings:

- DataGolf `current_score`: golfer tournament cumulative to par.
- DataGolf `today`: current-round to par through `thru`; `thru` is completeness, not score.
- DataGolf `R1`–`R4` and historical `round_n.score`: completed-round gross strokes.
- ESPN `strokes` / `relativeToPar`: one hole’s gross strokes / difference from par.
- `tournamentGolfers.score`: golfer tournament cumulative to par.
- `teams.roundOne`–`roundFour`: PGC counting-golfer average gross strokes.
- `teams.score`: PGC tournament or playoff cumulative to par.
- `playoffCarryoverScore`: already a to-par baseline; subtract no par and add it once.

Use `$datagolf-api` or `$espn-golf-scorecards` when provider ingestion is involved.

## Apply PGC scoring

Counting golfers are selected independently each round:

| Event               | Rounds 1–2 | Rounds 3–4 |
| ------------------- | ---------: | ---------: |
| Regular or St. Jude |         10 |     best 5 |
| BMW Championship    |     best 5 |     best 5 |
| TOUR Championship   |     best 3 |     best 3 |

For a completed round:

```text
team average strokes = sum(counting round strokes) / counting count
team round to par = round(team average strokes, 1 decimal) - course par
```

Round before adding tournament contributions. During live play, average counting golfers’ `today` values using the full counting denominator; an unplayed hole contributes no movement without shrinking the denominator.

- Keep position separate from score. Lower comparable numeric scores rank better; normal ties use competition ranking.
- Handle `CUT`, `WD`, `DQ`, and provider variants explicitly. A regular team needs five weekend-eligible golfers.
- A pre-cut WD/DQ receives `course par + 8` for a published incomplete R1/R2; completed rounds remain authoritative; terminal golfers do not count on weekends.
- A completed first-place tie uses combined DataGolf earnings for all ten rostered golfers. Missing or equal totals hold finalization.
- Points, payouts, and standings are outputs, not stroke units.
- Playoffs equal starting strokes plus prior-leg carryover plus current completed/live contributions. Gold and Silver remain separate; only the final leg awards results.

## Diagnose and verify

Trace provider field → validation → golfer persistence → counting set → team round → tournament/playoff total → position → awards/standings → DTO/UI. Identify the first boundary where meaning diverges; do not use a correct label as proof of correct storage.

Use hand-checkable focused tests covering applicable under/even/over-par values, partial and completed rounds, missing live fallback, course-par differences, 10/5/3-golfer averages, one-decimal rounding, terminal states, ties, earnings, corrections, and carryover. Assert stored numbers as well as formatted labels.
