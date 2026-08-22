# Registration and Rosters

## Purpose and current status

Registration creates a member's season/tour identity and records the season buy-in. Roster submission creates one fantasy team for a tournament. The backend supports regular-event picks, pre-season tour changes, exact pre-start privacy, same-group non-starter replacement, and a single playoff roster carried through all three playoff legs.

The home page currently presents registration as complete after resolving the member's first season card. Although backend validation permits cards on multiple tours in one season, the ordinary UI does not clearly offer a second registration path; that product decision remains open.

## Source paths

- Tour-card mutations and reads: `convex/functions/tourCards.ts`, `convex/utils/tourCards.ts`
- Team submission, carryover, and repair: `convex/functions/teams.ts`
- Pick pool and roster privacy: `convex/functions/tournaments.ts`
- Field, replacement, and playoff automation: `convex/functions/cronJobs.ts`, `convex/utils/playoffs.ts`
- Persisted model: `convex/schema.ts`
- Frontend workflows: `src/hooks/useTourCardRegistration.ts`, `src/hooks/useTourCardChange.ts`, `src/hooks/useTournamentPage.ts`
- UI: `src/components/widgets/TourCardForm.tsx`, `src/components/facilitators/PreTournamentContent.tsx`

## Identities and state flow

```text
authenticated member
  -> no card
  -> registered card on a season tour
  -> optional switch or delete before first event
  -> one team per card/tournament
  -> editable picks during the four-day window
  -> private roster until exact start
  -> public/live roster and result
```

Regular tournaments start with a new roster. A qualified playoff card selects once before the first playoff event; later legs inherit that roster and cumulative score. A qualifier who misses the first deadline receives an automatic empty team, even-par rounds, and retains starting strokes/carryover throughout the playoffs.

## Enforced invariants, units, and boundaries

### Registration

- The requested tour must belong to the requested season.
- Registration closes at `Date.now() >= season.registrationDeadline` when the deadline is configured.
- Creation rejects a second card for the same member/tour/season. Multiple tours in one season are currently allowed by the backend.
- Capacity is `tour.maxParticipants` when positive, otherwise 75. `tour.registeredCount` is the fast path with a bounded row-count fallback.
- The first completed `TourCardFee` for a member/season debits the member account by the selected tour's absolute `buyIn`; another card in that season does not create another fee.
- Switch and delete self-service close at the first non-cancelled tournament's `startDate`. There is no admin bypass through these self-service mutations.
- Deleting the last card in the season deletes that season's fee transactions and reverses their net completed amount. Deleting one of several cards retains the fee.

### Rosters

- The tour card must belong to the authenticated member and the tournament season.
- A negative member account blocks roster submission; zero and positive balances are eligible.
- Picks are accepted only for an upcoming tournament during `[startDate - 4 days, startDate)`.
- A roster contains exactly 10 distinct golfer API IDs. Every selected golfer must be in the tournament field with a positive group, and no group may contribute more than two golfers. With the normal five-group field this produces two picks per group, but the mutation enforces the cap rather than an explicit “all five groups” assertion.
- One team exists per `tourCardId`/`tournamentId`; a resubmission patches it and updates `updatedRosterAt`.
- Only qualified Gold/Silver cards may enter a playoff. Picks are accepted only for the first playoff event; later events carry over.
- Before evidence of play, a WD/non-starter can be replaced with the best available eligible world-ranked golfer in the same group who is not already on the roster. This applies to regular events and the first playoff leg, not later carryover legs.

## UI and public behavior

The clubhouse renders `TourCardForm` only for an authenticated member with a current season. It handles initial registration and existing-card change state, including deadline/capacity feedback from the backend.

An upcoming `/tournament` renders `PreTournamentContent` with the current member, applicable card, existing team, grouped pick pool, and playoff event index. Signed-out visitors can inspect public event information but cannot submit. Ungrouped late entrants may appear in the field while remaining unselectable.

Before the exact start instant, a viewer can retrieve only their own submitted roster/team detail. At and after start, public leaderboard/team queries may reveal all rosters. This is a server-side boundary; hiding a browser component is not sufficient.

## Writes and downstream effects

- Card creation increments `tour.registeredCount`, optionally records one negative fee transaction, changes the member account, and writes an audit log.
- Switching decrements/increments registered counts and moves that card's still-upcoming teams to the new tour. It does not rewrite active, completed, or cancelled results.
- Deletion removes the card and its teams, updates capacity counts, conditionally reverses the season fee/account, and audits the deletion.
- Team save creates or replaces canonical golfer IDs and playoff metadata and writes an audit log.
- Automated replacement changes `golferIds` and `updatedRosterAt`; later scoring consumes the repaired roster.
- Playoff reconciliation removes ineligible teams, creates missing empty teams after the deadline, repairs carryover metadata, and refreshes affected standings rows.

## Failure and recovery

Treat capacity counters as denormalized state. If a counter drifts, reconcile it against cards before changing limits. A field without complete groups should not be “fixed” by weakening roster validation; repair grouping or provider identity first.

Playoff reconciliation is designed to be idempotent. For legacy or corrected rosters, rebuild in dependency order: tournament field/groups, teams, standings contributions, standings rows/ranks, then any badges or notifications whose canonical result changed.

Do not manually fill an automatic empty playoff team: its emptiness is meaningful and must survive incomplete-roster and non-starter repair.

## Authorization and privacy

- Create, switch, delete, and save mutations derive the current member from auth and check ownership in Convex.
- Client-supplied `tourCardId`, `memberId`, role, or balance never grants access.
- Automated roster changes are internal; JSON team import is admin-only and audited.
- Opponent roster secrecy lasts until the tournament's exact `startDate`, even if cached public phase/status is stale.

## Focused tests

- `convex/hardening.test.ts`: registration deadlines/capacity/fees, payment gate, ownership, self-service cutoff, exact roster privacy, and pick validation
- `convex/playoffsBackend.test.ts`: qualifier enforcement, empty teams, inheritance, and reconciliation
- `convex/functions/teams.test.ts`: playoff score carryover
- `convex/functions/cronJobs.test.ts`: same-group non-starter replacement and playoff scoring boundaries
- `src/utils/tourCardRegistration.test.ts`: home-page registration visibility

## Reconciliation notes

- Backend multi-tour registration and the single-card-oriented home flow do not currently express the same product expectation.
- Card creation uses `season.registrationDeadline` as its temporal gate and does not call the first-event self-service cutoff used by switch/delete. Also, switching does not reject a destination tour where that member already has another card, so global member/tour/season uniqueness is not fully enforced.
- `PreTournamentContent` documentation says its dialog fetches a pick pool; the wired page supplies that pool from its parent read model.
- Several legacy team/tour-card reads and import paths remain. Mark callers before treating one as the canonical UI path.

## Related links

- [League structure](./LEAGUE_STRUCTURE.md)
- [Tournament lifecycle](./TOURNAMENT_LIFECYCLE.md)
- [Scoring](./SCORING.md)
- [Finance and settlements](./FINANCE_AND_SETTLEMENTS.md)
- [Backend architecture](../architecture/BACKEND.md)
- [Data repairs](../operations/DATA_REPAIRS.md)
