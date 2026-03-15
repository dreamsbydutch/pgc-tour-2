# Tournament Sync Data Flow

This document describes the current write behavior of `convex/crons/sync.ts`.

It is intentionally scoped to one question: when this sync runs, what data can it mutate, under which conditions, and in what order?

## Scope

The sync has two entry points:

- `runTournamentSync`: normal scheduled sync for the current tournament context.
- `updatePreviousTournament`: targeted sync for a specific tournament id, with cadence checks bypassed.

Both entry points eventually call the same engine: `runTournamentSyncEngine`.

## Read Inputs

Before any writes happen, the sync builds a tournament context and a merged stats payload.

Context query:

- `internal.functions.utils.getActiveTournamentData` for the scheduled path.
- `internal.functions.utils.getTournamentDataById` for the targeted path.

Merged stats action:

- `internal.functions.utils.getAllDataForTournament`

That stats payload combines:

- tournament, course, tier, teams, and existing tournament golfer rows from the database
- DataGolf field data
- DataGolf live leaderboard data
- DataGolf historical round data

If context lookup fails or merged stats lookup fails, the sync exits without writing anything.

## All Possible No-Write Exits

The sync can return without mutating data for any of these reasons:

- no tournament context found
- merged tournament stats could not be built
- `context.type === "recent"` and cadence was not bypassed
- `context.type === "next"` but no golfers exist yet for that tournament (`groups_not_created`)
- `context.type === "next"` outside the allowed local days Monday-Wednesday
- `context.type === "next"` outside the allowed local hour window
- `context.type === "next"` but the last pre-tournament sync happened too recently (`throttled_pre_tournament_sync`)
- `context.type !== "next"` outside the allowed local days Thursday-Sunday
- `context.type !== "next"` outside the allowed local hour window

`updatePreviousTournament` bypasses those cadence checks, so a recent tournament can still flow through the live-sync branch when that targeted action is called.

## Write Surface Summary

There are five concrete write paths in this file.

| Write path                             | Underlying mutation                                                               | Tables affected                | Trigger                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| Toggle next tournament to active       | `internal.functions.utils.updateTournamentInfo`                                   | `tournaments`                  | Upcoming branch decides play has already started                       |
| Repair incomplete team rosters         | `api.functions.teams.updateTeamRoster`                                            | `teams`                        | Upcoming branch finds a team with fewer than 10 golfers                |
| Insert missing field golfers           | `internal.functions.golfers.createMissingTournamentGolfers`                       | `golfers`, `tournamentGolfers` | Upcoming branch sees DataGolf field entries not present in local stats |
| Refresh live golfer state              | `internal.functions.golfers.updateTournamentGolfer`                               | `tournamentGolfers`            | Live branch computes changed golfer fields                             |
| Refresh live team and tournament state | `api.functions.teams.updateTeam`, `internal.functions.utils.updateTournamentInfo` | `teams`, `tournaments`         | Live branch computes changed team or tournament fields                 |

## Decision Tree

### 1. Entry point chooses tournament context

`runTournamentSync`:

- loads the current tournament context via `getActiveTournamentData`
- respects cadence gating

`updatePreviousTournament`:

- loads one tournament context via `getTournamentDataById`
- skips cadence gating

### 2. Engine builds the merged stats payload

`getTournamentStats` calls `getAllDataForTournament` and returns:

- `teams`
- `golfers`
- `fieldData`
- `liveData`
- `historicalData`

No writes occur here.

### 3. Engine applies the cadence gate

`getTournamentSyncGate` decides whether the run is allowed to continue based on:

- tournament type: `active`, `next`, or `recent`
- course timezone offset
- local day and local hour at the tournament site
- whether golfers already exist for a `next` tournament
- how recently the tournament leaderboard was last updated

If the gate says skip, the run returns with no mutation.

### 4. Branch by tournament type

- `next` goes to `syncUpcomingTournament`
- `active` goes to `syncLiveTournament`
- `recent` also goes to `syncLiveTournament` when cadence was bypassed

## Upcoming Tournament Branch

This branch has three distinct write patterns.

### A. Immediate tournament activation

The branch computes `openingTeeTime` from, in order:

- earliest round-one tee time in DataGolf field data
- earliest round-one tee time already attached to synced golfers
- existing `tournament.startDate`

It then derives lifecycle status:

- `active` if the tournament was already marked active, or
- `active` if the clock has passed `openingTeeTime`, or
- `active` if any golfer appears to have already started play, or
- otherwise `upcoming`

If that status resolves to `active`, the sync writes only one tournament patch and returns immediately.

Tournament fields patched:

- `status = "active"`
- `startDate = openingTeeTime`
- `leaderboardLastUpdatedAt = nowMs`
- `updatedAt` is added by the mutation helper

No team or golfer writes happen after this early return.

### B. Team roster repair for incomplete teams

If the tournament stays `upcoming`, the sync inspects every team.

For each team with fewer than 10 golfers:

- it checks each group `1..5`
- it calculates how many golfers are missing from that group, targeting exactly 2 golfers per group
- it fills missing slots from the global golfer pool for that tournament
- candidate golfers must be in the same group, have an `apiId`, and not already be on the team
- candidates are sorted by best OWGR rank first

If the roster grows, the sync writes through `updateTeamRoster`.

Team fields patched:

- `golferIds`
- `updatedAt`

This path never changes scores, positions, round values, or tee times.

### C. Creation of missing golfers from the field list

Still in the `upcoming` branch, the sync compares the merged golfer list against `fieldData.field`.

For every field golfer whose `dg_id` is not already present in local golfer stats, the sync queues that golfer for `createMissingTournamentGolfers`.

That downstream mutation can do two writes per golfer:

1. Insert into `golfers` if no golfer exists with the same `apiId`
2. Insert into `tournamentGolfers` if no tournament-golfer row exists for that golfer and tournament

Created `golfers` fields:

- `apiId`
- `playerName`
- `country`
- `worldRank`

Created `tournamentGolfers` fields:

- `golferId`
- `tournamentId`
- `worldRank`
- `group = 0`
- `usage = 0`
- `round = 0`
- `rating` from the DataGolf skill estimate
- `roundOneTeeTime`
- `roundTwoTeeTime`

This path only inserts missing rows. It does not update existing golfer or tournament-golfer rows.

### D. Final upcoming-tournament patch

After roster repair and missing-golfer insertion, the branch always writes one tournament patch.

Tournament fields patched:

- `startDate = openingTeeTime`
- `status = "upcoming"`
- `leaderboardLastUpdatedAt = nowMs`
- `updatedAt`

## Live Tournament Branch

This branch can update every synced tournament golfer, every team, and the tournament itself.

### A. Derived state used by the branch

Before writing anything, the branch computes:

- whether upstream historical data says the event is completed
- whether every golfer appears finished locally
- the current round from live data, defaulting to `5` when history says the event is completed
- whether live play is currently happening
- the tournament's first tee time
- a base lifecycle status
- golfer usage rates derived from team ownership

These values drive the downstream writes.

### B. Tournament golfer updates

The sync loops over every merged golfer that has both:

- a `golfers` row id
- a `tournamentGolfers` row id

For each golfer it computes a full next-state object, then diffs it against the existing `tournamentGolfers` row. Only changed fields are written.

Tournament golfer fields that may be patched:

- `tournamentId`
- `golferId`
- `position`
- `posChange`
- `score`
- `endHole`
- `makeCut`
- `topTen`
- `win`
- `today`
- `thru`
- `roundOne`
- `roundTwo`
- `roundThree`
- `roundFour`
- `roundOneTeeTime`
- `roundTwoTeeTime`
- `roundThreeTeeTime`
- `roundFourTeeTime`
- `usage`
- `round`
- `updatedAt`

Important derivation rules that change what gets written:

- non-ranking positions are `CUT`, `WD`, `DQ`, and `""`
- ranking positions are formatted as `Tn` for ties and `n` otherwise
- `posChange` is calculated against the previous leaderboard ordering implied by `current_score - today`
- round scores prefer live values, then historical values, then stored values
- for `WD` and `DQ`, rounds 1-2 can be force-filled as `coursePar + 8` when the round should exist but no score exists
- for `WD` and `DQ`, rounds 3-4 are never force-filled
- `today` can become `8` when the current round is a forced withdrawal/disqualification penalty round
- `thru` becomes `18` for that same forced penalty case
- `today` and `thru` are suppressed for non-ranking positions like `CUT`
- tee times prefer field data, then historical data, then stored tournament-golfer values
- `round` is a derived sync round from 0 through 5, where `5` represents fully completed tournament state

If the diff is empty, no golfer write happens for that golfer.

### C. Team updates

The sync next computes a derived next-state object for every team, then diffs and patches only changed fields.

The team computation uses team-local rules:

- rounds 1-2 use a 10-golfer mean
- rounds 3-4 use the best 5 eligible golfers
- a team is weekend cut once the current round is at least 3 and fewer than 5 golfers have positions other than `CUT`, `WD`, or `DQ`
- a weekend-cut team publishes no weekend live window, no round-three tee time, no round-four tee time, and no round-three or round-four aggregate score

For each team, the sync derives:

- round scores
- live `today` mean and `thru` mean
- round tee times
- aggregate score
- round number
- position within the tour
- past position within the tour
- earnings
- playoff points

Team fields that may be patched:

- `makeCut`
- `score`
- `topTen`
- `topFive`
- `topThree`
- `win`
- `today`
- `thru`
- `round`
- `roundOneTeeTime`
- `roundOne`
- `roundTwoTeeTime`
- `roundTwo`
- `roundThreeTeeTime`
- `roundThree`
- `roundFourTeeTime`
- `roundFour`
- `earnings`
- `points`
- `position`
- `pastPosition`
- `updatedAt`

Important derivation rules that change what gets written:

- a weekend-cut team gets `position = "CUT"`
- otherwise positions are ranked only against teams in the same `tour`
- tied teams receive `Tn` positions
- earnings and points are recalculated every run from team rank and tie count
- round-three and round-four tee times are based on the latest 5 golfers after sorting tee times ascending and slicing the final 5 entries

If the diff is empty, no team write happens for that team.

### D. Final tournament update

After golfer and team loops, the sync computes one final tournament state.

Tournament fields that may be patched:

- `currentRound`
- `livePlay`
- `startDate`
- `status`
- `updatedAt`

How those fields are derived:

- `currentRound` is derived from the highest complete state across all teams, bounded to `0..5`
- `livePlay` is `false` when the event is considered complete, otherwise it is `true` if DataGolf says play is live or any golfer appears mid-round locally
- `startDate` can be corrected to the earliest round-one tee time found in current golfer data
- `status` stays `completed` once already completed
- otherwise `status` becomes `completed` only when the event looks complete and every golfer and every team has reached sync round `5`
- otherwise `status` falls back to the derived base lifecycle state

If none of those values changed, no tournament write happens in this final step.

## Write Ordering

Within one run, writes happen in this order:

1. Optional early tournament toggle in the upcoming branch
2. Optional team roster repairs in the upcoming branch
3. Optional missing golfer inserts in the upcoming branch
4. Final upcoming-tournament patch
5. Per-golfer tournament-golfer patches in the live branch
6. Per-team patches in the live branch
7. Final tournament patch in the live branch

There is no single transaction covering the whole run. Each mutation is applied independently and sequentially.

## Practical Audit Checklist

If you want to verify the flow is correct, these are the checkpoints that matter most:

- A `next` tournament can become `active` and return before any golfer or team sync happens.
- Scheduled runs never sync a `recent` tournament, but `updatePreviousTournament` can.
- Pre-tournament roster repair only changes `teams.golferIds`.
- Missing field golfers can create both a global golfer row and a tournament-golfer row.
- Live golfer sync never inserts; it only patches existing `tournamentGolfers` rows.
- Team rankings are computed only within the same `tour`.
- Weekend-cut teams suppress weekend round outputs.
- Tournament completion requires both a completion signal and all golfers and teams reaching round `5`.
- Tournament `updatedAt`, team `updatedAt`, and tournament-golfer `updatedAt` are set inside the downstream mutation helpers, not directly in `sync.ts`.
