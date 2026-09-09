# Data Model and Indexes

`convex/schema.ts` is the persisted source of truth. This catalog explains ownership and relationships; it does not replace field validators or indexes in the schema.

## Core relationship

```text
season
  -> tours -> tourCards -> teams -> standingsContributions
  -> tiers -> tournaments -> tournamentGolfers -> tournamentGolferScorecards
  -> courses              -> tournamentSyncState / espnIdentityAudit

member
  -> tourCards / transactions / settlementRequests
  -> preferences / subscriptions / notifications / deliveries
```

`appState`, `syncRuns`, `auditLogs`, email guards, standings rows, and major badges are operational or materialized views around those canonical records.

## League and competition tables

| Table                    | Role and ownership                                                                   | Important relationships/index intent                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `members`                | Clerk-linked person, profile, active state, role, cent balance, friend references    | Unique Clerk identity is a logical invariant; indexed by Clerk ID, email, role, activity, name, login, account                    |
| `seasons`                | League edition/year and registration/date boundaries                                 | Tours, tiers, tournaments, and cards point here; indexed by year/number/dates                                                     |
| `tours`                  | One competition within a season; buy-in, capacity/count, playoff allocation          | Indexed by season and name+season; `registeredCount` is materialized                                                              |
| `tiers`                  | Season-specific points and cent payout arrays by finishing slot                      | Tournament award source; indexed by season and name+season                                                                        |
| `courses`                | Course identity, par/front/back, location, provider ID, timezone offset              | Tournament parent; offset is currently consumed as milliseconds but the schema does not encode the unit                           |
| `tournaments`            | Scheduled event, status, course/tier/season, provider IDs, legacy sync/email markers | Indexed by season/tier/course/status/ESPN ID and date combinations                                                                |
| `tourCards`              | Member's competitive identity for one tour+season; maintained aggregate mirror       | Indexed by member/season/tour and points. Backend permits one card per tour; logical uniqueness is enforced in mutations          |
| `teams`                  | One card's 10 DataGolf golfer IDs and result for one tournament                      | Denormalized season/tour/member/name/playoff fields support bounded leaderboards; indexed by tournament/card/competition/position |
| `standingsContributions` | Canonical completed-event snapshot per card+tournament for history and recomputation | Logical key is card+tournament; indexed for card history, tournament refresh, season/tour rebuild                                 |
| `standingsRows`          | Lean materialized regular-season aggregate and rank per card+season                  | Canonical hot standings read; indexed by card/season/variant and season/tour/rank                                                 |

`standingsContributions` and `standingsRows` own standings history/aggregates. Corresponding totals on `tourCards` are maintained for legacy consumers and must remain in parity; do not treat the mirror as the only canonical history.

## Golfer and synchronization tables

| Table                        | Role and ownership                                                                                           | Important relationships/index intent                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `golfers`                    | Stable local golfer identity with DataGolf numeric ID and optional ESPN ID                                   | Indexed by both provider IDs, name, and world rank                                                    |
| `tournamentGolfers`          | Event-scoped field membership, group, live/final performance, tee times, usage, and tournament rank metadata | Unique golfer+tournament is logical; recurring reads index tournament, golfer, position, score, round |
| `tournamentGolferScorecards` | Canonical isolated ESPN round/hole cells per golfer+tournament                                               | Indexed by golfer+tournament and tournament; legacy embedded rounds remain a migration fallback       |
| `tournamentSyncState`        | Normalized DataGolf marker, final-data completeness, timestamps, failures, skip reason                       | One logical row per tournament; indexed by tournament                                                 |
| `espnIdentityAudit`          | Unmatched/resolved/error queue for safe event/golfer identity reconciliation                                 | Indexed by entity+ESPN ID, tournament, golfer, and status                                             |

Tournament-scoped facts never belong on `golfers`: a group, tee time, score, finish, usage, or event earnings is specific to `tournamentGolfers` or a provider response. DataGolf and ESPN IDs remain separate identities.

## Finance tables

| Table                | Role and ownership                                                    | Important relationships/index intent                                                                            |
| -------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `transactions`       | Signed ledger movement plus status; positive credits, negative debits | Links member/season and optionally settlement; indexed for member/season/type/status/reconciliation             |
| `settlementRequests` | Season-end allocation snapshot and per-item completion/audit state    | One active/completed request per member+season is a logical invariant; indexed by member/season and status/time |

`members.account` is a materialized cent balance updated in the same transaction as a completed ledger movement. Official tournament earnings are derived from completed team results; provider earnings used for a golf tiebreak are not ledger values.

Most financial workflows append a transaction or use an explicit compensating movement. One narrow exception exists today: deleting a member's final pre-cutoff tour card deletes that season's fee rows while reversing their completed net amount. Do not generalize that cleanup behavior to payments, winnings, or settlements.

## Messaging and operational tables

| Table                     | Role and ownership                                                               | Important relationships/index intent                                                         |
| ------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pushSubscriptions`       | Authenticated member's browser endpoint and delivery health                      | Endpoint ownership moves to the latest registering member; indexed by member and endpoint    |
| `notificationPreferences` | Member category switches for push behavior                                       | One logical row per member; missing means defaults enabled                                   |
| `notificationEvents`      | Domain event/deduplication identity                                              | Stable `dedupeKey`; indexed by key and creation time                                         |
| `notifications`           | Durable member inbox row                                                         | Indexed by member+time/read and event+member                                                 |
| `notificationDeliveries`  | Per-subscription web-push attempt, lease, retry, and outcome                     | Indexed by due status/time, notification+subscription, and member                            |
| `auditLogs`               | Sensitive create/update/delete/restore evidence and snapshots                    | Indexed by member, entity, and action; changes may contain domain-specific audit data        |
| `emailDispatchGuards`     | Server-side email lease and cooldown                                             | One logical row per operation key                                                            |
| `syncRuns`                | Job lease/history, trigger, actor, counts, duration, skip/failure evidence       | Indexed by job+status/time and run key                                                       |
| `appState`                | Singleton public timeline, pick boundaries, version, live-chain scheduling/lease | Key is always `primary`; materialized from seasons/tournaments                               |
| `majorChampionBadges`     | Materialized winner badge per season/member/tournament                           | Rebuilt after applicable completion; Canadian Open uses a deliberate special badge projector |

## Units and representations

| Value                                  | Representation                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Convex IDs                             | Table-scoped `Id<"table">`; never interchangeable with Clerk or provider IDs                     |
| Clerk identity                         | String subject on `members.clerkId`; private authentication identifier                           |
| DataGolf golfer identity               | Numeric `golfers.apiId` and `teams.golferIds` values                                             |
| ESPN identity                          | String event/athlete ID, stored separately                                                       |
| App timestamps                         | Unix epoch milliseconds unless an external boundary explicitly says otherwise                    |
| Course timezone offset                 | Used as milliseconds today; schema documentation is incomplete, so audit values before migration |
| Ledger/tier/tour money                 | Safe integer cents; format at the presentation boundary                                          |
| DataGolf tiebreak earnings             | Provider numeric comparison across a roster; not a member ledger amount                          |
| Golfer tournament `score`, `today`     | Relative-to-par values from DataGolf                                                             |
| Golfer `R1`–`R4` / historical rounds   | Gross strokes                                                                                    |
| Team `roundOne`–`roundFour`            | PGC average gross strokes, rounded to one decimal                                                |
| Team `score` / `playoffCarryoverScore` | PGC relative-to-par total/baseline                                                               |
| `position`                             | Display/rank string such as `1`, `T2`, `CUT`, `WD`, `DQ`; not a score                            |
| Points                                 | League points from tier slots; not strokes or money                                              |

Missing, zero/even, terminal, partial, and synthetic are distinct states. Never use truthiness to decide whether a valid numeric zero exists.

## Indexes and logical uniqueness

Convex indexes speed access; they do not enforce relational uniqueness. Mutations and repairs must prevent duplicates for logical keys such as member Clerk ID, member+tour, card+tournament team/contribution, card+season standings row, golfer+tournament, sync state+tournament, preference+member, event dedupe key, and app-state key.

Use the index matching the first constrained fields and bound the remaining result. Add an index only for a demonstrated recurring access pattern; update `npm run convex:io-check` and payload tests when changing a hot read.

## Canonical, materialized, and transitional data

- Canonical competition results live on `teams`; standings contributions/rows and tour-card aggregates derive from them.
- `appState`, standings rows, team denormalized identity, tour registration counts, and major badges are materialized for hot reads.
- `tournamentGolferScorecards` is canonical for ESPN hole cells; embedded `tournamentGolfers.espnRounds` is a migration fallback.
- Tournament sync markers have a normalized table while legacy tournament fields remain compatible.
- Tee-time unions accept string/number legacy data. Normalize at boundaries and do not expand compatibility without a migration plan.

For a correction/rebuild sequence, see [backend write flow](BACKEND.md#write-and-correction-flow) and [data repairs](../operations/DATA_REPAIRS.md).
