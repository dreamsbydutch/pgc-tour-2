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
