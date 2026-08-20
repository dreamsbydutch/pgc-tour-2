# PGC League and App Guide

This is the shared product contract for the PGC Tour. Read it before changing
tournament fields, rosters, scoring, positions, awards, standings, payouts, or
playoffs.

The in-app rulebook records league intent. The Convex backend and tests record
behavior currently enforced by the app. If they disagree, preserve the intent,
identify the implementation gap, and confirm the rule before making a broad
change. An intentional rules change updates the rulebook, backend, tests, and
this guide in the same change.

## League structure

The PGC Tour is a season-long fantasy golf league based on selected PGA Tour
events.

- A season contains tours, tournament tiers, tournaments, and tour cards.
- A member competes through a tour card on a specific tour.
- A regular tournament gives every eligible tour card a new 10-golfer team.
- Teams compete only against teams in the same tour and playoff division.
- Tournament finishes award PGC Cup Points and league earnings.
- Regular-season points determine standings and playoff qualification.
- The intended regular schedule is 16 events: 4 Majors, 6 Elevated events, and
  6 Standard events. The database and in-app rulebook hold the actual schedule.
- Tier records hold award distributions. Points and payouts must never be
  hardcoded when tier data is available.

These records are not interchangeable:

| Record            | Meaning                                                 |
| ----------------- | ------------------------------------------------------- |
| Member            | The authenticated person and financial account          |
| Tour card         | That member's season/tour entry and cumulative standing |
| Team              | The tour card's picks and result for one tournament     |
| Golfer            | Stable golfer identity                                  |
| Tournament golfer | That golfer's group and performance in one event        |

## End-to-end league workflow

```text
Schedule and tier configuration
  -> DataGolf field + rankings
  -> five tournament groups
  -> member roster submissions
  -> DataGolf live results + ESPN hole scores
  -> team round scores
  -> tour-specific positions
  -> tier points and payouts
  -> season standings
  -> playoff qualification and carryover
```

Each stage feeds the next. A correction to an upstream stage must invalidate or
recompute every affected downstream result.

## 1. Build the tournament field

The grouping workflow combines the DataGolf field-updates and rankings feeds.
Before writing groups, it confirms that the external event name is compatible
with the scheduled PGC tournament.

The app then:

1. Joins field entries to rankings by DataGolf golfer ID.
2. Removes explicitly excluded golfer IDs.
3. Sorts highest to lowest by `dg_skill_estimate`; missing estimates sort last.
4. Divides the ranked field into five tournament-specific groups.

| Group |    Target share | Maximum |
| ----- | --------------: | ------: |
| 1     |             10% |      10 |
| 2     |           17.5% |      16 |
| 3     |           22.5% |      22 |
| 4     |             25% |      30 |
| 5     | Remaining field |    None |

After Groups 1–3 fill, the allocator balances the remaining golfers between
Groups 4 and 5 while respecting Group 4's target and cap. The algorithm and
exclusions live in `convex/utils/golfers.ts` and
`convex/functions/_constants.ts`.

Groups are intended to be final on Monday before the event. The scheduled job
runs Monday at 17:00 UTC and can retry twice at one-hour intervals. An
administrator can also run it manually.

Once groups are final:

- Late additions to the PGA field are added to the tournament leaderboard as
  ungrouped golfers, but are not normal selectable PGC golfers.
- A group belongs to the tournament golfer, not the global golfer.
- Excluded golfer IDs remain excluded until the league deliberately changes the
  policy.
- The second and third playoff events copy the prior playoff field and teams
  instead of producing new rosters.

## 2. Submit a team

A valid regular team contains exactly 10 distinct golfers: 2 from each of the 5
groups. The backend enforces 10 distinct grouped golfers and no more than 2 from
any group, which necessarily produces the 2-per-group roster.

Submission rules:

- Picks open four days before the tournament and close at its start time.
- The tour card and tournament must belong to the same season.
- A member can change an existing roster only while picks remain open.
- A member with a negative account balance cannot submit picks.
- A playoff roster requires a qualified tour card.
- Picks are accepted only for the first playoff event; later playoff rosters
  carry over.

### Pre-start withdrawals and non-starters

Before a golfer has recorded evidence of play, a withdrawal or non-start may be
replaced by the best available world-ranked golfer from the same group. The
replacement must be participating, eligible, and absent from the existing
team. This applies to regular events and the first playoff event; later playoff
events inherit the established roster.

Do not replace a golfer after actual play has begun.

## 3. Score the tournament

PGC scoring averages PGA stroke totals. Lower is better. Counting golfers are
selected independently for each round.

### Regular events and first playoff event

- **Rounds 1–2:** all 10 golfers count. A PGA stroke changes the team average
  by `0.1`.
- **Rounds 3–4:** the 5 lowest golfer scores for that round count. A PGA stroke
  changes the team average by `0.2`.

Each completed team-round average is rounded to one decimal place. The
tournament score is the sum of the round averages relative to course par, with
the live round contribution included while play is underway.

Example for a par-72 course:

```text
(71.4 - 72) + (72.1 - 72) + (70.8 - 72) + (71.0 - 72) = -2.7
```

### Cuts, withdrawals, and disqualifications

- A regular team needs at least 5 weekend-eligible golfers. Otherwise the team
  is `CUT`.
- A golfer who withdraws or is disqualified before the cut receives an
  8-over-par score for a published first or second round they did not complete.
- A completed round remains the score of record.
- Cut, withdrawn, and disqualified golfers do not count on the weekend.
- For sorting, numeric scores rank before terminal states; terminal ordering is
  `CUT`, `WD`, then `DQ`.

The feed can briefly contain overlapping rounds. The app keeps the earliest
unfinished round as the current scoring window and must not publish a future
round early.

## 4. Rank teams and award results

Teams are ranked within their tour/division by total PGC score. Normal ties use
competition ranking (`T2`, followed by the appropriate skipped position).
Terminal teams do not displace active numeric teams.

### First-place tiebreak

When teams on the same tour share the best completed score, the team with the
highest combined actual PGA earnings across all 10 rostered golfers wins.

- Exactly one highest total resolves first place.
- The remaining formerly tied leader or leaders move to second place.
- Earnings must be available for every golfer on every tied roster.
- Missing earnings or equal combined totals leave the tiebreak unresolved.
- An unresolved first-place tiebreak holds the tournament in `active` state
  instead of finalizing an incorrect winner.

### Points and payouts

The tournament tier is the only award source.

- Position selects the applicable points and payout slots.
- Tied teams below the resolved first-place case split all occupied award slots
  evenly.
- The average award is rounded to a whole number.
- Official league earnings accumulate through completed events and are settled
  at season end.

Any correction to a completed team's points or earnings requires a standings
recompute.

## 5. Maintain standings

Standings are separate for each tour. Completed regular-season teams contribute:

- PGC Cup Points
- wins
- top-five and top-ten finishes
- made cuts
- appearances

Completed playoff earnings are included in total league earnings, but playoff
points and finishes do not alter the regular-season standing.

Tour cards rank by total regular-season points. Equal totals share the same
competition position. The backend intentionally has no secondary
regular-season tiebreaker; do not invent one from earnings, wins, or countback.

Standings are recomputed after tournament completion and by the daily
maintenance job. Upcoming or still-active events are not official standings
inputs.

## 6. Run the playoffs

Each tour stores playoff allocation as `[goldSpots, silverSpots]`. The intended
standard is:

- Gold: top 15
- Silver: next 20
- Not qualified: everyone below those allocations

The persisted tour-card value is `1` for Gold, `2` for Silver, and `0` for not
qualified. Qualification counts the cards with strictly more points. Therefore
a tie across a boundary currently gives every tied card the same level. A
change to that behavior is a league-rules decision.

Gold and Silver are separate competitions across the three FedEx Cup playoff
events. Gold determines the PGC Champion; Silver awards bonus money and
bragging rights.

- One 10-golfer roster carries through all three events.
- Scores are intended to carry forward for all 12 rounds.
- The first two event positions are interim playoff checkpoints, not standalone
  career finishes. Only the final TOUR Championship result counts as one
  playoff appearance, awards playoff points and payouts, and may add a career
  win, top five, or top ten.
- Gold starting strokes scale from `-10` for the highest qualifier to `0` for
  the lowest.
- Silver starting strokes scale from `-10` to the configured floor, with lower
  qualifiers starting at `0`.
- Point ties receive the average of the starting-stroke slots occupied by the
  tie.
- A qualified member who does not submit a playoff roster before the first
  event starts remains on the Gold or Silver leaderboard with an empty
  automatic team. That team records even par for every round in all three
  playoff events while retaining its starting strokes and cumulative carryover.
  Incomplete-roster repair and pre-start replacement must leave that team empty.
- A rostered golfer absent from the BMW or TOUR Championship field is treated
  as `CUT` for that leg and appears below the active golfers in the expanded
  roster. The original 10-golfer roster remains unchanged.
- A team with fewer than 5 active golfers at BMW or fewer than 3 at the TOUR
  Championship records even par for every round of that leg while retaining
  its incoming carryover. Eligibility is recalculated for each field, so a
  golfer can become active again at the TOUR Championship after missing BMW.
- Playoff tier payout slots are fixed: Gold uses positions 1-75 and Silver uses
  positions 76-150, regardless of the actual bracket sizes.

Counting golfers change by event:

| Event                       | Counting golfers                       |
| --------------------------- | -------------------------------------- |
| FedEx St. Jude Championship | 10 in Rounds 1–2; best 5 in Rounds 3–4 |
| BMW Championship            | Best 5 in every round                  |
| TOUR Championship           | Best 3 in every round                  |

### Playoff implementation

The backend derives qualification from regular-season point totals whenever a
playoff roster is submitted or reconciled; it does not trust a stale playoff
flag. It persists starting strokes and each prior-event score as the next
event's carryover baseline. Live synchronization adds only the current leg to
that baseline and ranks Gold and Silver independently of the cards' original
tours. Reconciliation removes ineligible or out-of-sequence playoff teams and
audits each deletion.

Before changing playoff scoring, continue to verify with end-to-end tests that:

- Gold and Silver are ranked and awarded as separate competitions;
- starting strokes affect the first playoff leaderboard score;
- BMW rounds always count 5;
- TOUR Championship rounds always count 3; and
- live synchronization preserves prior-event carryover.

Do not treat display output alone as proof that the persisted competition score
is correct.

## Automated operating cycle

- `appState` maintains the current season, active/next event, pick window, and
  public version.
- The application timeline refreshes every 15 minutes and schedules exact pick
  and tournament-start boundaries.
- Live tournament synchronization starts at the event boundary, repeats every
  4 minutes while the event is active, and uses leases to prevent overlapping
  runs.
- A 30-minute repair job restores a broken live-sync chain.
- Standings recompute daily at 04:00 UTC and after completion.
- Groups run Monday at 17:00 UTC with retry protection.
- The complete golfer directory and world-rank metadata refresh daily at 15:00
  UTC. An administrator can also run the same sync before creating groups.
- Admin actions exist for grouping, live sync, prior-event repair, standings,
  read-model rebuilds, and identity resolution.

Automatic and manual jobs must be idempotent, authenticated where public,
audited, and safe to retry.

## Change checklist

Before merging a league-affecting change:

1. Identify whether it changes league intent, current enforcement, or both.
2. Trace the full downstream path from field/roster through standings.
3. Preserve tour and playoff competition boundaries.
4. Read points and payouts from tier data.
5. Verify pre-start replacement and terminal-state behavior.
6. Verify ties, occupied award slots, and the completion hold.
7. Verify playoff selection counts, starting strokes, and carryover when
   relevant.
8. Add focused tests for every affected edge case.
9. Update the in-app rulebook and this guide when intent changes.

Primary implementation references:

- `src/utils/rules.ts`
- `convex/functions/cronJobs.ts`
- `convex/functions/teams.ts`
- `convex/functions/tournaments.ts`
- `convex/functions/readModels.ts`
- `convex/functions/_constants.ts`
- `convex/utils/golfers.ts`
- `convex/utils/misc.ts`
- `convex/schema.ts`
