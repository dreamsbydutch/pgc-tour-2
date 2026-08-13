---
name: espn-golf-scorecards
description: Diagnose, test, or change PGC Tour's ESPN golf scoreboard scraper and hole-scorecard pipeline. Use for the ESPN endpoint, defensive parsing, event or golfer identity matching, scorecard merging, audits, team hole averages, partial data, corrections, and WD/DQ hole synthesis.
---

# ESPN golf scorecards

Read `docs/LEAGUE_AND_APP_GUIDE.md` before changing scoring behavior. ESPN is an unofficial, best-effort hole-cell source; DataGolf remains authoritative for golfer/tournament totals, status, finish, earnings, and points. An ESPN failure or disagreement must not block or overwrite DataGolf scoring. Use `$golf-scoring-czar` for score units.

## Fetch and parse defensively

```text
https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=YYYYMMDD
```

Use the local tournament `startDate`, not today. No key is used. Fetch from a Convex internal action as `unknown`; current behavior is a 20-second timeout, two retries, and one-second retry delay.

Parse the smallest valid boundaries:

```text
events[] -> competitions[0] -> competitors[]
  -> athlete.id/displayName
  -> linescores[] (round: period 1..4, value = optional gross total)
  -> linescores[] (hole: period 1..18, value = strokes,
                   scoreType.displayValue = relative to par)
```

Map `E`/`EVEN` to numeric zero and signed integers normally. Drop only malformed events/players/rounds/holes; preserve valid siblings. Normalize rounds and holes in numeric order.

## Resolve identity without guessing

- Event: prefer saved `tournaments.espnId`; otherwise require one unique best compatible name. Audit candidate IDs/names and skip on none or ambiguity.
- Golfer: keep DataGolf `golfers.apiId` separate from `golfers.espnId`; prefer saved ESPN mapping.
- Normalize Unicode/accents, punctuation, suffixes, comma order, whitespace, conservative nicknames, and initials. Existing scores are exact 100, given+surname 90, nickname/initial+surname 80, compound-family 75.
- Require one unique best score ≥75 and reject conflicts with another saved ESPN identity. Persist successful mappings; audit unmatched players.

## Merge and persist scorecards

- Store by tournament+golfer in `tournamentGolferScorecards`; read legacy `tournamentGolfers.espnRounds` only as migration fallback.
- Merge by round then hole. Incoming same-hole data corrects the cell; omitted cells and omitted round totals preserve stored values, including a WD who disappears.
- Normalize before equality checks to avoid order-only writes. Apply deltas in chunks of 50.
- Run ESPN after DataGolf succeeds or confirms an unchanged marker; log/audit ESPN failure without rolling back DataGolf.
- Return the team scorecard only for exactly ten unique golfers with all scorecard identities available.

## Apply PGC-only display transformations

Team hole values mirror PGC denominators: rounds 1–2 use ten golfers; rounds 3–4 use the five counting golfers. Sum received hole differentials but divide by the full counting count, so an unplayed golfer adds no movement without shrinking the denominator. Store completion counts and withhold segment totals until all counting golfers finish every hole in the segment.

For a DataGolf-finalized R1/R2 WD/DQ at `coursePar + 8` with an incomplete ESPN card:

1. Preserve every real hole.
2. Infer hole par from real votes using `strokes - relativeToPar`; ignore synthetic votes and invalid par outside 2–6.
3. Fill unseen pars from the tournament’s configured course front/back totals; this does not independently resolve multi-course events.
4. Distribute only the remaining differential across missing holes so the round totals exactly +8; mark them `synthetic: true`.
5. If exact reconciliation is impossible, preserve the partial golfer card and return `null` for the ten-golfer team card while that penalty round lacks 18 holes.

Synthetic holes repair the display only and may never update authoritative golfer or PGC tournament totals.

## Change and verify

Core locations: `convex/functions/espnGolf.ts` (fetch, audits, persistence), `convex/utils/espnGolf.ts` (parser, matching, merge, synthesis), `convex/types/espnGolf.ts`, `convex/utils/espnGolf.test.ts`, `src/utils/teamHoleScorecard.ts`, and `convex/schema.ts`.

Use sanitized fixtures, never live payloads, for tests. Cover nested parsing, malformed siblings, simultaneous events, accents/aliases, ambiguous/conflicting identity, corrections, omitted WD cells, ordering equality, +8 synthesis, impossible par maps, denominator/completion behavior, and the invariant that ESPN writes no DataGolf-owned score field.
