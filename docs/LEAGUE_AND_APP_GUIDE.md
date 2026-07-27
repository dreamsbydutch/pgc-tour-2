# PGC Tour App and League Guide

This document is the shared product context for agents working on the PGC Tour app. Read it before changing tournament fields, rosters, scoring, standings, payouts, or playoffs.

The in-app rulebook describes the league's intended behavior. The Convex backend is the source of truth for behavior currently enforced by the app. If they disagree, do not silently choose one: preserve the league intent, identify the implementation difference, and confirm the desired behavior before making a broad rules change.

## The league at a glance

The PGC Tour is a season-long fantasy golf league built around selected PGA Tour events.

- A season contains tours, tour cards, tournaments, and tournament tiers.
- A member competes through a tour card on a particular tour.
- For every regular tournament, each eligible tour card submits a new 10-golfer team.
- Teams compete against the other teams on their tour for that tournament.
- Tournament finishes award PGC Cup Points and league earnings.
- Points determine the season standings and playoff qualification.
- The regular schedule contains 16 events: 4 Majors, 6 Elevated events, and 6 Standard events.
- Tournament tier records hold the points and payout arrays. Do not hardcode an award table when it should come from tier data.

## From DataGolf field to five groups

The app creates the selectable tournament field from two DataGolf feeds:

1. The field-updates feed supplies the golfers entered in the PGA event.
2. The rankings feed supplies each golfer's DataGolf skill estimate, OWGR, and related ranking data.

Before accepting the field, the app verifies that the DataGolf event name is compatible with the scheduled PGC tournament. It then joins field entries to rankings by DataGolf golfer ID, removes explicitly excluded golfers, and sorts the field from highest to lowest `dg_skill_estimate`. A golfer without a skill estimate sorts at the bottom.

The ranked field is divided into five groups:

| Group | Target share of field | Maximum size |
| --- | ---: | ---: |
| 1 | 10% | 10 |
| 2 | 17.5% | 16 |
| 3 | 22.5% | 22 |
| 4 | 25% | 30 |
| 5 | Remaining golfers | No fixed cap |

After Groups 1 through 3 fill, the grouping algorithm balances the remainder between Groups 4 and 5 while respecting Group 4's target and cap. Group numbers are stored on the tournament-golfer records.

Groups are intended to be finalized on Monday before the tournament. The scheduled grouping job currently runs Monday at 17:00 UTC and retries after an hour when necessary. An administrator can also run it manually.

Important field rules:

- Golfers added to the PGA field after groups are finalized are not normal selectable PGC-field golfers for that event.
- Excluded DataGolf IDs must stay excluded unless the league deliberately changes that policy.
- Group assignment is tournament-specific. A golfer's group can change from one event to the next.
- Later playoff events copy the field and teams from the prior playoff event instead of building a new selectable field.

## Building a tournament team

A regular tournament team contains exactly 10 distinct golfers: exactly 2 golfers from each of the 5 groups.

The backend enforces the practical equivalent by requiring 10 distinct, grouped golfers and allowing no more than 2 from any group. Because there are exactly five valid groups, a valid 10-player roster necessarily contains 2 from each.

Additional roster rules:

- A new team is selected for every regular-season tournament.
- Picks currently open four days before the tournament and close at the tournament start time.
- A member must use a tour card from the same season as the tournament.
- A member with a negative account balance cannot submit picks.
- Only playoff-qualified tour cards may submit a playoff roster.
- The playoff roster is selected before the first playoff event and carries through the remaining playoff events.

### Pre-start withdrawals and non-starters

If a rostered golfer withdraws or otherwise does not start before recording any play, the app replaces that golfer with the highest available world-ranked golfer from the same group.

The replacement:

- must not already be on that team;
- must belong to the same tournament group;
- must still be an eligible, participating golfer; and
- is chosen by the best available world rank.

This automatic replacement applies to regular tournaments and the first playoff event. Later playoff events inherit the established playoff roster.

## Regular tournament scoring

PGC scoring is based on a team's average PGA stroke score for each round. Lower is better.

### Rounds 1 and 2

All 10 rostered golfers count.

The team round score is the average of the 10 golfers' stroke totals, rounded to one decimal place. Because the score is averaged across 10 golfers, one PGA stroke changes the PGC score by `0.1`.

### Rounds 3 and 4

Only the five lowest golfer scores on the team for that round count.

The team round score is the average of those five scores, rounded to one decimal place. Because the score is averaged across 5 golfers, one PGA stroke changes the PGC score by `0.2`.

The five counting golfers are selected independently each round. They are not a permanent subset of the roster.

### Tournament total

Each completed team round is converted to score relative to the course par. The tournament score is the sum of the team's four round scores to par, with the live current-round contribution included while play is active.

Example: if a par-72 team's round averages are 71.4, 72.1, 70.8, and 71.0, its tournament score is:

`(71.4 - 72) + (72.1 - 72) + (70.8 - 72) + (71.0 - 72) = -2.7`

### Cuts, withdrawals, and disqualifications

- A team needs at least five weekend-eligible golfers. If fewer than five remain eligible for Rounds 3 and 4, the PGC team is marked `CUT`.
- A golfer who withdraws or is disqualified before the cut receives an 8-over-par score for a published Round 1 or Round 2 that they did not complete.
- If that golfer completed the round, the completed score is used.
- Withdrawn, disqualified, and cut golfers do not contribute to weekend rounds.
- For sorting, active numeric scores rank first, followed by `CUT`, `WD`, and `DQ` states.

## Tournament positions, winners, and tied awards

Tournament teams are ranked by their total PGC score within their competition grouping. The lowest score wins. Normal ties use competition ranking, such as `T2`.

### First-place tiebreaker

If multiple teams finish with the same best PGC score, first place is decided by the highest combined actual PGA earnings of all 10 golfers on each tied roster.

- The team with the single highest combined roster earnings is assigned first place.
- The remaining formerly tied teams move to second place or tied second.
- The app waits for earnings data for every golfer on each tied roster.
- If earnings data is missing, or the tied teams also have equal combined earnings, the tiebreak remains unresolved and the tournament is held in the active state rather than being finalized incorrectly.

### Points and payouts

Points and payouts come from the tournament's tier record:

- Standard, Elevated, and Major tournaments can have different award distributions.
- The league rulebook awards PGC Cup Points to the top 35 regular-tournament finishers.
- Payouts and points are selected by finishing position from their respective tier arrays.
- When teams tie at a position other than the resolved first-place case, they evenly split the awards for all positions occupied by the tie. The app averages those award slots and rounds the result to a whole number.
- League earnings accumulate through the season and are paid at the end of the year.

## Season standings

Standings are maintained separately for each tour.

After completed tournaments, the app aggregates each tour card's:

- PGC Cup Points;
- league earnings;
- wins;
- top-10 finishes;
- made cuts; and
- appearances.

Tour cards are ranked primarily by total PGC Cup Points. Equal point totals receive the same tied position label. For example, if two cards share the second-highest point total, both display `T2`, and the next position follows competition-ranking rules.

The current standings calculation does not apply a secondary season-standing tiebreaker after points. Do not invent an earnings, wins, or countback tiebreaker without a league decision.

Standings are recomputed after tournament completion and by a daily maintenance job. Only completed tournaments contribute to the official `points` and `earnings` totals.

## Playoff qualification

Each tour stores its playoff allocation as `[goldSpots, silverSpots]`. The league's intended standard is:

- Gold: the top 15 tour cards on each tour.
- Silver: the next 20 tour cards on each tour.
- Everyone below the Gold and Silver cutoffs is not playoff-qualified.

The persisted playoff flag uses:

- `1` for Gold;
- `2` for Silver; and
- `0` for not qualified.

Qualification is based on how many tour cards have strictly more points. As a result, a points tie at a qualification boundary receives the same playoff level in the backend. Treat changes to boundary-tie behavior as a league-rules decision, not a presentation tweak.

## Playoff format

Gold and Silver are separate playoff competitions:

- The Gold winner is the season's PGC Champion.
- Silver is a bonus-money and bragging-rights competition.
- Each playoff covers 12 rounds across the three FedEx Cup playoff events.
- The same 10-golfer roster carries through all three events.
- Scores are intended to carry forward from one playoff event to the next.

### Starting strokes

Playoff starting strokes reward regular-season standings.

- Gold scales linearly from `-10` for the highest-points qualifier to `0` for the lowest-points Gold qualifier.
- Silver scales linearly from `-10` for the highest-points Silver qualifier to `0` at the configured floor; lower Silver qualifiers start at `0`.
- When qualifiers are tied in points, the displayed starting strokes are the average of the stroke slots occupied by the tie.

Starting strokes and carryover are league invariants. Changes to playoff scoring must verify that the value is not merely displayed but is also included in the persisted leaderboard score.

### Counting golfers by playoff event

| Playoff event | Counting golfers |
| --- | --- |
| FedEx St. Jude Championship | All 10 in Rounds 1-2; best 5 in Rounds 3-4 |
| BMW Championship | Best 5 in every round |
| TOUR Championship | Best 3 in every round |

The counting golfers are recalculated independently for every round.

### Current implementation caution

The codebase contains the playoff selection-count rules and copies rosters/scores into later playoff events. The main live-sync scoring path still needs to be treated carefully when changed: verify in tests that the BMW uses 5, the TOUR Championship uses 3, starting strokes affect the first playoff score, and prior-event scores remain included after live sync. Do not assume the presence of display logic alone proves end-to-end playoff scoring.

## Data flow and operational model

At a high level:

`DataGolf field + rankings -> tournament golfers and groups -> member rosters -> live golfer scores -> team scores and positions -> tier awards -> season standings -> playoff qualification`

- Field grouping is a pre-tournament operation.
- Live tournament synchronization runs every four minutes when an applicable tournament is active or near its start.
- The sync updates golfer rounds, team scores, positions, awards, tournament status, and eventually standings.
- Tournament completion must wait when a first-place tiebreak cannot yet be resolved.
- Manual admin jobs exist for group creation, live synchronization, standings recomputation, and repair workflows.

## Rules for agents

When working on league behavior:

- Preserve the distinction between a member, tour card, tournament team, golfer, and tournament golfer.
- Keep tournament-specific facts such as group, tee time, score, and position on tournament-scoped records.
- Never hardcode season-specific point or payout arrays when tier data is available.
- Apply scoring rules per round and per playoff event; do not select one permanent set of counting golfers.
- Rank and award teams within the intended competition grouping.
- Preserve first-place earnings tiebreak behavior and the completion hold for unresolved ties.
- Recompute or invalidate downstream standings whenever completed team points or earnings change.
- Add focused tests for any change involving cuts, withdrawals, ties, award-slot splitting, playoff boundaries, starting strokes, or score carryover.
- Update this guide and the user-facing rulebook together when the league rules intentionally change.

## Primary code references

- `src/lib/rules.ts`: user-facing league rulebook.
- `convex/functions/cronJobs.ts`: DataGolf grouping, live scoring, positions, tiebreaks, awards, and standings.
- `convex/functions/teams.ts`: roster submission and validation.
- `convex/functions/tournaments.ts`: playoff roster/team carryover.
- `convex/functions/_constants.ts`: group targets, caps, exclusions, and pick-window constants.
- `convex/utils/golfers.ts`: five-group allocation algorithm.
- `convex/utils/misc.ts`: award splitting and playoff golfer-count helpers.
- `convex/schema.ts`: core league data model.
