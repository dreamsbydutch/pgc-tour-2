# PGC Glossary

PGC uses similar-looking identities, scores, states, and money values for different purposes. Use these terms precisely in code, UI, tests, and discussion.

## People and competition

| Term                      | Meaning                                                                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Member                    | Authenticated person and league/financial account. A member can own cards in multiple tours.                                            |
| Clerk subject / `clerkId` | Private external authentication identifier. It is not a Convex member ID and is not public display data.                                |
| Role                      | Persisted `regular`, `moderator`, or `admin` authorization level. Server checks are authoritative.                                      |
| Friend                    | A member-selected reference used for viewer filters/context; it is not a mutual social graph guarantee.                                 |
| Season                    | One league edition/year containing tours, tiers, tournaments, and tour cards.                                                           |
| Tour                      | One competition within a season, with its own buy-in, capacity, standings, and playoff allocation.                                      |
| Tour card                 | A member's competitive identity for one tour and season. It owns registration and maintained aggregate context.                         |
| Tier                      | A season-scoped points and payout-slot distribution such as Standard, Elevated, Major, or Playoff.                                      |
| Tournament                | One scheduled PGC/PGA event with course, tier, provider identity, time window, and lifecycle status.                                    |
| Course                    | Tournament venue and par/timezone metadata.                                                                                             |
| Golfer                    | Stable local identity keyed to DataGolf and optionally ESPN.                                                                            |
| Tournament golfer         | One golfer's event-specific group, tee time, live/final result, and usage.                                                              |
| Team / roster             | A tour card's golfer selections and PGC result for one tournament. “Team” is the persisted row; “roster” commonly means its golfer IDs. |
| Group                     | One of five tournament-specific pick pools. A normal roster selects two golfers from each.                                              |
| Gold / Silver             | Separate playoff brackets derived from regular-season points and tour allocation. `playoff` values are 1/2; 0 means not qualified.      |

## Scoring and awards

| Term                     | Meaning                                                                                                                           |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Gross strokes            | Actual stroke count for a hole/round, such as 71 on a par-72 course.                                                              |
| Relative to par / to par | Difference from applicable par, such as -1. Scope must name hole, round, tournament, or playoff.                                  |
| `today`                  | DataGolf/current PGC contribution for the live round, normally relative to par through `thru`; not a completed gross round.       |
| `thru`                   | Hole-progress/completeness marker, not a score.                                                                                   |
| Team round average       | Average gross strokes of that round's counting golfers, rounded to one decimal before conversion to par.                          |
| Counting golfers         | Golfers whose round values enter the team average: 10/5 for normal or St. Jude, 5/5 at BMW, 3/3 at TOUR Championship.             |
| Team score               | PGC tournament/playoff cumulative relative-to-par result, not raw strokes.                                                        |
| Carryover                | Existing relative-to-par playoff baseline from starting strokes or a prior leg; add once and never subtract par from it.          |
| Position                 | Competition rank/status string (`1`, `T2`, `CUT`, `WD`, `DQ`), separate from score.                                               |
| Competition ranking      | Ties share a rank and skip the subsequently occupied positions.                                                                   |
| Terminal state           | Non-numeric completion/status such as `CUT`, `WD`, or `DQ`; it has explicit sort/count rules.                                     |
| Synthetic hole           | PGC-only ESPN display cell invented to reconcile an eligible WD/DQ +8 penalty round; never an authoritative provider/score write. |
| PGC Cup Points           | League standing points read from tournament tier slots. Not FedExCup/provider points.                                             |
| Payout                   | League earnings from a tier slot, stored as cents on team/card results.                                                           |
| Provider earnings        | DataGolf PGA earnings used comparatively for the ten-golfer first-place tiebreak; not automatically ledger money.                 |
| Starting strokes         | Gold/Silver playoff advantage derived from qualifying rank and tie-slot averaging.                                                |

## State and timing

| Term                     | Meaning                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `appState`               | Singleton materialized public timeline and exact-schedule markers; efficient display context, not mutation authority.    |
| Season phase             | `no-season`, `registration`, `in-season`, or `completed` in `appState`.                                                  |
| Tournament status        | Persisted `upcoming`, `active`, `completed`, or `cancelled`; some selectors also use date-derived fallback.              |
| Pick window              | Four-day interval ending at exact tournament start. Server time gates writes/privacy.                                    |
| Preflight                | 30-minute field-feed check during an open pick window that updates the earliest R1 tee/start boundary.                   |
| Live play                | Confirmed current-round play; adaptive sync uses a faster cadence than merely active/between-round state.                |
| Completion hold          | Tournament remains active because a first-place tiebreak lacks complete/unique roster earnings.                          |
| Recent-completed handoff | Default tournament selection may retain a just-completed event for up to 72 hours unless the next event has real groups. |
| Public version           | Increment on material `appState` changes so public consumers can recognize refreshed timeline state.                     |
| Exact boundary           | Scheduler/server-time event such as pick open/close or tournament start, distinct from periodic UI refresh.              |

## Persistence and operations

| Term                          | Meaning                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Canonical record              | Authoritative persisted input/result from which other state derives, such as a completed team result.                              |
| Materialized read model       | Denormalized bounded representation for a hot screen, such as `standingsRows` or `majorChampionBadges`.                            |
| Mirror                        | Maintained legacy/compatibility aggregate such as totals on `tourCards`; it must match the canonical model but is not its history. |
| DTO                           | Explicit public/viewer/admin response shape. It protects privacy, size, and coupling.                                              |
| Logical key                   | Relationship that must be unique by code even though Convex indexes do not enforce uniqueness.                                     |
| Cursor page                   | Bounded batch plus continuation token used for reads/repairs that cannot finish safely in one mutation.                            |
| Idempotent                    | Repeating the operation derives the same desired state without duplicate side effects.                                             |
| Lease                         | Persisted ownership/token with expiry that prevents concurrent job or delivery execution.                                          |
| `syncRuns`                    | Operational history/lease records for scheduled/manual jobs, including status, actor, counts, skip reason, and errors.             |
| Audit log                     | Sensitive before/after or deletion evidence tied to actor/entity/action. It is not general debug logging.                          |
| Dry run                       | Read-only preview of exact targets/counts/effects before a sensitive operation; it never implies authorization to execute.         |
| Development Convex deployment | Isolated backend used for local work/tests. Never substitute production for missing local data.                                    |

## Money and identity units

All league money is safe integer cents until presentation. Positive transactions credit the member; negative transactions debit. Zero, missing, pending, failed, and cancelled are distinct.

Convex document IDs, Clerk subjects, DataGolf numeric golfer IDs, ESPN string IDs, tournament IDs, member IDs, and tour-card IDs are different namespaces. Name matching is never a substitute for a stable identity when ambiguity exists.

Related: [data model](../architecture/DATA_MODEL.md), [scoring](../domain/SCORING.md), [finance](../domain/FINANCE_AND_SETTLEMENTS.md), and [tournament lifecycle](../domain/TOURNAMENT_LIFECYCLE.md).
