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

- Event: prefer saved `tournaments.espnId`; otherwise require one unique best compatible name. Audit candidate IDs/names and skip on none or ambiguity.
- Golfer: keep DataGolf `golfers.apiId` separate from `golfers.espnId`; prefer saved ESPN mapping.
- Normalize Unicode/accents, punctuation, suffixes, comma order, whitespace, conservative nicknames, and initials. Existing scores are exact 100, given+surname 90, nickname/initial+surname 80, compound-family 75.
- Require one unique best score ≥75 and reject conflicts with another saved ESPN identity. Persist successful mappings; audit unmatched players.

## Merge and persist scorecards

- Store by tournament+golfer in `tournamentGolferScorecards`; read legacy `tournamentGolfers.espnRounds` only as migration fallback.
- Merge by round then hole. Incoming same-hole data corrects the cell; omitted cells and omitted round totals preserve stored values, including a WD who disappears.
- Normalize before equality checks to avoid order-only writes. Apply deltas in chunks of 50.
- Run ESPN after DataGolf succeeds or confirms an unchanged marker; log/audit ESPN failure without rolling back DataGolf.
- Require exactly ten unique roster golfer IDs, then return every available
  scorecard. An empty result represents a valid team with no holes yet; reserve
  `null` for an invalid roster or an unreconciled WD/DQ penalty round.

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
