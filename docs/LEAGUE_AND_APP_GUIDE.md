# League and App Guide

This is the domain router for any change that can affect registration, fields, rosters, scores, positions, points, payouts, standings, playoffs, member balances, or league communication.

## Source contract

- `src/utils/rules.ts` is the organizer-confirmed rulebook displayed to members.
- Convex functions, utilities, schema, and tests define what the app enforces today.
- Tournament tiers in the database define points and payout distributions; do not hardcode them when tier data exists.
- [Known gaps](KNOWN_GAPS.md#league-intent-versus-enforcement) records confirmed disagreements.

An intentional rule change updates the rulebook, enforcement, focused tests, and the canonical domain page in one change. Do not infer a new rule from a convenient UI or provider field.

## End-to-end league flow

```text
season + tours + tiers + courses + schedule
  -> member registration and tour cards
  -> DataGolf directory, field, rankings, and five groups
  -> 10-golfer roster submission or playoff inheritance
  -> DataGolf tournament totals + ESPN hole display
  -> PGC round averages, positions, points, and payouts
  -> standings contributions and materialized ranks
  -> Gold/Silver qualification, starting strokes, and carryover
  -> official earnings and season settlement
```

Each stage feeds the next. A correction is complete only after every affected downstream stage is refreshed or deliberately shown as pending.

## Domain guides

1. [League structure](domain/LEAGUE_STRUCTURE.md)
2. [Members and access](domain/MEMBERS_AND_ACCESS.md)
3. [Registration and rosters](domain/REGISTRATION_AND_ROSTERS.md)
4. [Tournament lifecycle](domain/TOURNAMENT_LIFECYCLE.md)
5. [Scoring](domain/SCORING.md)
6. [Standings and playoffs](domain/STANDINGS_AND_PLAYOFFS.md)
7. [Finance and settlements](domain/FINANCE_AND_SETTLEMENTS.md)
8. [Messaging and notifications](domain/MESSAGING_AND_NOTIFICATIONS.md)

The [code map](reference/CODE_MAP.md) connects each guide to routes, hooks, Convex operations, tables, tests, and the matching project skill.

## Cross-domain completion check

For league-affecting work, identify the canonical input, comparison scope (tour or playoff bracket), lifecycle phase, score/money units, authorization boundary, materialized consumers, correction path, and focused edge cases before editing. Verify every applicable tie, terminal state, exact time boundary, regular/playoff distinction, and partial-provider state.
| Group | Target share | Maximum |
| ----- | --------------: | ------: |
| 1 | 10% | 10 |
| 2 | 17.5% | 16 |
| 3 | 22.5% | 22 |
| 4 | 25% | 30 |
| 5 | Remaining field | None |

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

Expanded-team hole scoring uses every available ESPN scorecard while retaining
the full event counting denominator. A valid team with no completed holes shows
an empty scorecard grid; the unavailable message is reserved for an invalid
roster or an unreconciled WD/DQ penalty scorecard.

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

### Season-end accounts and winnings

After the current season is complete, an administrator credits each member's
official season earnings to that member's PGC account. The operation is
paginated, audited, and safe to rerun; completed `TournamentWinnings`
transactions are the credit ledger.

An existing negative account balance is paid first from the season earnings.
The member then allocates their full positive account balance, including any
funds carried into the season, across any combination of:

- an e-transfer to an email address they specify;
- the season-end charity donation;
- a donation to PGC league costs;
- a fixed $100 reserve for a next-season tour card; and
- funds left unreserved in their PGC account for future fees.

The full available account balance must be accounted for. E-transfers and
donations debit the member account when an administrator confirms the real-world
action. The next-season card choice earmarks $100 but does not create a tour card
or choose a tour; the member completes that choice when registration opens.
The admin payout queue lists each requested e-transfer destination and amount;
marking a transfer paid records its withdrawal exactly once.

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
