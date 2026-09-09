# Standings and Playoffs

## Purpose and current status

Official standings summarize completed tournament results into one materialized regular-season row per tour card. Regular-season points determine competition rank and Gold/Silver qualification; completed playoff earnings are included in total earnings, but playoff points and checkpoint finishes do not alter the regular-season table.

The current source is `standingsContributions` plus `standingsRows`. Aggregate fields on `tourCards` remain a compatibility mirror, not the row to edit when repairing history.

## Source paths

- Schema and indexes: `convex/schema.ts`
- Canonical aggregation/ranking: `convex/utils/standings.ts`
- Refresh/backfill entry points: `convex/functions/standings.ts`
- Public standings/history reads: `convex/functions/seasons.ts`
- Playoff assignments/starting strokes: `convex/utils/playoffs.ts`
- Team reconciliation/carryover: `convex/functions/teams.ts`, `convex/functions/tournaments.ts`
- Standings UI: `src/hooks/useStandingsPage.ts`, `src/hooks/useStandingsHistory.ts`, `src/components/facilitators/StandingsView.tsx`
- Live projection: `src/hooks/useLeaderboardStandingsProjection.ts`, `src/utils/leaderboardStandings.ts`

## Identities and state flow

```text
completed team result
  -> one standings contribution per card/tournament
  -> one regular standings row per card/season
  -> per-tour competition rank and movement
  -> playoff level: 1 Gold / 2 Silver / 0 out
  -> tour-card compatibility mirror
  -> first playoff team and starting strokes
  -> BMW and TOUR carryover
```

A contribution is a compact result snapshot with season/tour/card/member identity, tournament/tier metadata, playoff flag, points, league earnings, position, score, and gross rounds. The row is a materialized aggregate with `variant: "regular"`.

## Enforced invariants, units, and boundaries

### Official standings

- Only tournaments persisted as `completed` contribute to official totals.
- Regular-season completed events contribute points, wins, top-five/top-ten finishes, made cuts, and appearances.
- All completed events—including playoffs—contribute league earnings in integer cents.
- Points and cents are rounded to whole stored values during aggregation.
- Equal regular-season point totals share a competition position. Rank is `1 + count(cards on that tour with strictly more points)`; there is no earnings, wins, or countback tiebreaker.
- `pastPoints` removes the latest completed regular result and supports movement display. Rank/movement recomputation is separate from contribution aggregation.

### Qualification and playoff score

- `tour.playoffSpots[0]` is the Gold count and `[1]` is the additional Silver count. Invalid/missing values become zero.
- Qualification also counts only cards with strictly more points. A tie across a cutoff gives every tied card the same bracket, so the actual bracket can exceed the nominal allocation.
- Gold starting strokes scale from -10 for the highest qualifier to 0 for the lowest. Silver scales from -10 to its configured/floor behavior, with lower qualifiers at even par. Equal point totals receive the one-decimal average of their occupied stroke slots.
- Gold and Silver are independent competitions. A single first-leg roster and cumulative score carry through St. Jude, BMW, and the TOUR Championship.
- A missing first-leg roster becomes an empty automatic team with even-par rounds while preserving its starting strokes/carryover.
- St. Jude and BMW positions are checkpoints. Only the final TOUR Championship result creates the playoff appearance/awards and may add a career win, top five, or top ten.

Playoff detection currently relies on `playoff` appearing in the tier or tournament name in several backend paths. Preserve that naming invariant until the data model gains an explicit flag.

## UI and public behavior

`/standings?season=<id>&tour=<id>` loads up to 50 seasons and a bounded current-season index: tours, tiers, at most 500 materialized rows, and major champion badges. The view supports per-tour tables, a playoff grouping, movement, friend marking/filtering, season selection, and expandable card history.

History is fetched only when a row expands and is paginated at 25 by the hook (server maximum 50 per page and 512 KiB). The standalone `/history` route remains a placeholder.

During an active regular event, the tournament page can compute a provisional standings snapshot by adding current team points to official card totals. It is browser-derived, timestamped with leaderboard freshness, suppressed for playoffs, and unavailable for a tour if necessary team points are partial. It never mutates official rows.

## Writes and downstream effects

Canonical team changes upsert the corresponding contribution, recompute each affected card row, then recompute season ranks/playoff levels. The rank pass mirrors official totals and position onto `tourCards` for legacy callers.

Playoff reconciliation consumes official assignments to remove ineligible teams, create deadline-missed empty teams, repair metadata, and propagate prior-event roster/score. Champion badge read models are rebuilt separately from standings; the Canadian Open is badge-eligible through an explicit exception even when it is not in a Major tier.

Settlement reads sum official nonnegative earnings from tour-card mirrors after standings synchronization, so a corrected payout must reach both the materialized row and mirror before settlement.

## Failure and recovery

Do not patch a row or tour card as the primary fix. Correct the canonical tournament/team result, then rebuild:

1. Tournament golfers and teams, if the provider/result changed.
2. `standingsContributions` for affected tournaments/cards.
3. `standingsRows` for affected cards.
4. Season ranks, movement, playoff assignments, and legacy tour-card mirrors.
5. Playoff teams/carryover, badges, notifications, and settlement review when affected.

`adminBackfillSeason` is bounded to ten cards per page and resumable by cursor; `adminRecomputeSeasonRanks` repairs ranks after rows exist. Run production repairs only with an explicit, reviewed plan.

## Authorization and privacy

Standings, public card identity, results, history, and badges are display-safe public league data. Public projections exclude Clerk IDs, email, account balance, friends, and private operational fields. A signed-in viewer's friend list is combined on the client only for their own display.

Refreshes are internal; backfills and manual rank recomputation require server-side admin authorization. Pre-start roster privacy remains in force even when a card already appears in public standings.

## Focused tests

- `convex/standingsReadModel.test.ts`: contribution aggregation, completed/playoff boundaries, materialized rows, ranks, deltas, and bounded history
- `convex/functions/cronJobs.test.ts`: canonical standings totals and completed-result effects
- `convex/utils/playoffs.test.ts`: bracket assignments, cutoff ties, and starting strokes
- `convex/playoffsBackend.test.ts`: eligibility, empty teams, and carryover reconciliation
- `convex/functions/teams.test.ts`: cumulative playoff score persistence
- `src/utils/leaderboardStandings.test.ts`: provisional live ranks, destinations, availability, and starting strokes

## Reconciliation notes

- Older architecture language describing `tourCards` as the aggregate standings source is stale; the table now mirrors the materialized read model for compatibility.
- Public `/history` is not implemented despite the working per-card history query inside standings.
- Playoff naming is behavioral configuration today. Renaming tiers/events without tests can drop contributions from playoff classification.

## Related links

- [Scoring](./SCORING.md)
- [Registration and rosters](./REGISTRATION_AND_ROSTERS.md)
- [Finance and settlements](./FINANCE_AND_SETTLEMENTS.md)
- [Data model](../architecture/DATA_MODEL.md)
- [Backend architecture](../architecture/BACKEND.md)
- [Data repairs](../operations/DATA_REPAIRS.md)
