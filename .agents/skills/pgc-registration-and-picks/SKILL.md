---
name: pgc-registration-and-picks
description: Explain, diagnose, test, or change PGC tour-card registration, tour switching, fees, tournament pick windows, roster validation, pre-start privacy, substitutions, and playoff roster inheritance.
---

# PGC registration and picks

Read `docs/LEAGUE_AND_APP_GUIDE.md` before changing registration or roster rules. Keep member, tour card, tournament team, golfer, and tournament golfer identities distinct.

## Register and change tour cards

- Derive the member from authentication. Require the tour and season to exist and match, registration to be before its deadline, no duplicate card for the same tour, and destination capacity to remain available.
- Create the card, increment the exact tour count, and charge one season fee atomically. Multiple cards in one season do not create multiple fees.
- Close tour-card switching and deletion at the exact start of the season's first non-cancelled tournament; admin role does not bypass this self-service boundary.
- On a same-season switch, enforce ownership/capacity, decrement/increment tour counts, update only future non-cancelled/non-completed teams, and audit affected IDs.
- On deletion, remove the card's teams and decrement its tour count. Remove and reverse the fee only when no other card remains for that member/season. Audit the deleted rows and account adjustment.

## Accept tournament picks

- Picks open four days before `tournament.startDate` and close at the exact start. Reject active, completed, cancelled, early, and start-boundary submissions.
- Require the caller to own the card, card and tournament to share a season, and the member account to be non-negative.
- Require exactly 10 distinct DataGolf golfer IDs, each in that tournament's grouped field, with no more than two from any group. Five valid groups therefore produce two per group.
- Upsert one team per tournament+tour card and refresh denormalized `seasonId`, `tourId`, `memberId`, `displayName`, and roster timestamp together.
- Before first tee, expose only the authenticated member's own roster/team detail. Reveal the tournament field of teams only at the exact start boundary.

## Handle withdrawals and playoffs

Replace a pre-start non-starter only before evidence of play, with the best eligible world-ranked golfer from the same group who is participating and absent from the roster. Apply this to regular events and the first playoff event only. Use `$datagolf-api` for feed identity/status and `$golf-scoring-czar` for terminal-state behavior.

Derive playoff qualification from current regular-season points, not a stale card flag. Accept picks only for the first playoff event; later events inherit the prior roster and carryover. Rank Gold and Silver separately and audit removal of ineligible or out-of-sequence teams.

## Trace and test changes

Trace registration UI/hook -> `tourCards` mutation -> transaction/account/tour count, and picks UI/hook -> pick pool -> `saveMyTournamentTeam` -> pre-start/public leaderboard. Primary code is in `convex/functions/tourCards.ts`, `teams.ts`, `tournaments.ts`, `convex/utils/tourCards.ts`, and the registration/pick hooks.

Test exact time boundaries, cancelled first events, ownership, same-season checks, capacity, duplicate fee/card, last-card refund, 10/distinct/group rules, negative balances, create/update idempotency, pre-start privacy, substitution evidence, playoff qualification, and later-event carryover.
