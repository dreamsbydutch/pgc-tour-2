# Scoring

## Purpose and current status

PGC scoring converts individual PGA rounds into a fantasy-team competition while preserving golf units explicitly. DataGolf supplies authoritative golfer totals, rounds, status, and positions. The backend computes team round averages, relative-to-par totals, ranks, tier awards, and playoff carryover. ESPN hole scores enrich the display but never replace the authoritative tournament total.

The in-app rulebook states league intent. `convex/functions/cronJobs.ts` and its tests define the edge cases currently enforced, especially round publication, cuts, WD/DQ, ties, and playoff event differences.

## Source paths

- Organizer copy: `src/utils/rules.ts`
- Canonical sync/scoring/awards: `convex/functions/cronJobs.ts`
- Shared backend scoring helpers: `convex/utils/misc.ts`, `convex/utils/standings.ts`
- Persisted golfer/team fields: `convex/schema.ts`
- DataGolf validation: `convex/validators/datagolf.ts`, `convex/functions/datagolf.ts`
- ESPN scorecards: `convex/functions/espnGolf.ts`, `convex/utils/espnGolf.ts`
- Client scorecard aggregation/formatting: `src/utils/teamHoleScorecard.ts`, `src/utils/app.ts`
- Leaderboard UI: `src/hooks/useTournamentPage.ts`, `src/components/facilitators/LeaderboardView.tsx`

## Identities and state flow

Do not interchange these measures:

| Value                                     | Unit and meaning                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| Golfer `roundOne`…`roundFour`             | Gross strokes for a completed/published PGA round                                            |
| Team `roundOne`…`roundFour`               | Mean gross strokes of the golfers counting that round; decimals are valid                    |
| Golfer `score` / DataGolf `current_score` | Tournament total relative to par                                                             |
| Golfer/team `today`                       | Current published round relative to par                                                      |
| Team `score`                              | Sum of published team rounds relative to course par, plus playoff carryover where applicable |
| `earnings` on teams/tour cards            | League award in integer cents                                                                |
| DataGolf historical golfer earnings       | Raw provider value used only to compare first-place tied rosters                             |

```text
prestart
  -> round live
  -> round closed/published
  -> next round (with overlap protection)
  -> completed feed
  -> first-place tiebreak if needed
  -> awarded and completed, or completion hold
```

## Enforced invariants, units, and boundaries

### Counting golfers

| Competition event             | Round 1 | Round 2 | Round 3 | Round 4 |
| ----------------------------- | ------: | ------: | ------: | ------: |
| Regular event                 |      10 |      10 |  Best 5 |  Best 5 |
| FedEx St. Jude playoff leg    |      10 |      10 |  Best 5 |  Best 5 |
| BMW playoff leg               |  Best 5 |  Best 5 |  Best 5 |  Best 5 |
| TOUR Championship playoff leg |  Best 3 |  Best 3 |  Best 3 |  Best 3 |

The average makes one PGA stroke worth 0.1 team strokes when ten count and 0.2 when five count. The backend derives the divisor from the actual event/round rule; do not reproduce it as a display-only constant.

### Publication and terminal states

- The earliest unfinished round is the visible scoring window when provider rounds overlap.
- A completed round remains the score of record.
- A WD or DQ receives `course par + 8` only for a published, incomplete Round 1 or Round 2. The backend does not synthesize weekend +8 rounds for a golfer who never participates in them.
- CUT, WD, and DQ golfers do not count on weekend team rounds. A regular team without five weekend golfers becomes a terminal/cut team.
- Numeric scores rank ahead of terminal teams. Terminal display order is CUT, then WD, then DQ.
- Lower numeric score is better. Teams compete within the same tour and playoff division, not in one global list.

### Positions, ties, and awards

- Positions use competition ranking: equal scores share a position and the next position skips occupied slots.
- A completed tie for the best score on one tour/division uses the highest combined actual PGA earnings of all ten rostered golfers. Exactly one highest total resolves the winner.
- Missing earnings or another tie in combined earnings leaves leaders at T1 and keeps the tournament active with a recorded completion-hold reason.
- Tier arrays are the only points/payout source. Below the resolved first-place case, tied teams split every occupied award slot evenly; the mean is rounded to a whole value (points, or cents for payouts).
- Playoff payout slots reserve 1–75 for Gold and 76–150 for Silver. The first two playoff legs are checkpoints; only the final leg awards the playoff result and career finish.

## UI and public behavior

The tournament page displays the PGA golfer leaderboard and PGC team leaderboard for the selected event/tour/division. Live `today`, `thru`, round, score, movement, and freshness can be partial while a round is active. A missing ESPN scorecard means hole detail is unavailable; it does not make the DataGolf total invalid.

Team hole averages are built only from completed hole segments available for the counting golfers. UI formatting preserves meaningful decimals and golf labels such as E, CUT, WD, and DQ.

Before tournament start, public viewers do not receive opponent roster contents. At/after start, golfer composition and scorecard detail may be shown with the leaderboard.

## Writes and downstream effects

Live synchronization patches event-specific golfer rows and teams in bounded batches. A canonical team result includes round fields, relative score, status/position, award statistics, points, and earnings.

When a completed result changes, the scoring path must refresh its `standingsContributions` row, recompute the affected `standingsRows` and ranks, update the legacy tour-card mirror, and reconsider final-result notifications and champion badges. The Canadian Open badge uses the special maple logo.

The schema contains an optional `tournamentGolfers.earnings` field described as cents, but the live update path does not populate it. First-place comparison uses raw historical DataGolf earnings in memory; it is neither a ledger balance nor the team's league payout.

## Failure and recovery

Incomplete or stale feeds should leave values partial and freshness visible. Do not infer a future round, a cut, or completion from wall-clock time alone.

An unresolved first-place tiebreak is an intentional recovery state. Restore provider earnings/identity and rerun the canonical sync instead of manually assigning position 1. ESPN identity or hole failures can be repaired independently because DataGolf remains authoritative for totals.

For a corrected completed result, follow the materialized-data rebuild order rather than editing tour-card totals directly.

## Authorization and privacy

Provider fetches, scoring mutations, award writes, and finalization are internal or admin-triggered server work. Administrative imports and repairs require server-side admin authorization.

Public score DTOs contain display-safe tournament, team, and golfer fields. Raw provider responses, sync leases/errors, member private fields, and pre-start opponent rosters are not public contracts.

## Focused tests

- `convex/functions/cronJobs.test.ts`: round publication, counting golfers, WD/DQ, playoff counts/carryover, ranks, tiebreak, awards, and completion hold
- `convex/functions/teams.test.ts`: persisted playoff carryover arithmetic
- `convex/utils/espnGolf.test.ts`: defensive hole parsing, identity, merge behavior, and terminal synthesis
- `src/components/displays/PGCLeaderboard.test.ts`: team hole-average denominators, completion, and counting sets
- `src/components/displays/PGALeaderboard.test.tsx`: golfer/team hole display, partial data, and synthetic-cell labels
- `src/utils/scoreFormatting.test.ts`: decimal and golf-state presentation
- `src/utils/tournamentAwards.test.ts`: Gold/Silver payout columns

## Reconciliation notes

- `src/utils/rules.ts` describes post-cut WD handling more broadly than current code. Enforced code applies +8 only to a published incomplete first or second round and excludes terminal golfers on the weekend.
- The rulebook sentence for the first-place tiebreak says “or their entire roster”; the implemented meaning is combined earnings **of** the entire roster. Organizer confirmation is still required before correcting intent copy.
- Rulebook prose is static. Changes to backend counting, terminal states, or tie handling must update copy, implementation, focused tests, and this page together.

## Related links

- [Tournament lifecycle](./TOURNAMENT_LIFECYCLE.md)
- [Registration and rosters](./REGISTRATION_AND_ROSTERS.md)
- [Standings and playoffs](./STANDINGS_AND_PLAYOFFS.md)
- [Integrations](../architecture/INTEGRATIONS.md)
- [Data model](../architecture/DATA_MODEL.md)
- [Data repairs](../operations/DATA_REPAIRS.md)
