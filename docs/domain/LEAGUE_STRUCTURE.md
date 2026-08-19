# League Structure

## Purpose and current status

PGC Tour is a season-long fantasy-golf league for a friends-and-family community. Members buy a tour card, submit a 10-golfer roster for each regular event, earn PGC Cup points and league earnings, qualify for Gold or Silver playoffs, and settle earnings after the season.

The persisted season, tours, tiers, courses, and tournaments are the operational schedule. `src/utils/rules.ts` is organizer-approved copy shown in the rulebook, but it is intent rather than an executable configuration. The intended regular schedule is 16 events—four Majors, six Elevated events, and six Standard events—while the database determines what the current season actually contains.

## Source paths

- Intent and maintained contract: `src/utils/rules.ts`, `docs/LEAGUE_AND_APP_GUIDE.md`
- Persisted entities and indexes: `convex/schema.ts`
- Current-season and rulebook reads: `convex/functions/seasons.ts`
- Public timeline/read model: `convex/functions/readModels.ts`, `convex/functions/home.ts`
- Display-safe projections: `convex/utils/publicDtos.ts`
- UI: `src/routes/index.tsx`, `src/routes/rulebook.tsx`, `src/routes/standings.tsx`, `src/routes/tournament.tsx`

## Identities and state flow

```text
season
  -> tours (entry fee, capacity, playoff spots)
  -> tiers (points and payout slots)
  -> courses (par and time offset)
  -> tournaments (schedule and provider identity)

member -> tour card -> tournament team -> result
       -> standings contribution -> standings row -> playoff assignment
       -> official earnings -> settlement request
```

The small `appState` singleton exposes one current season and a public phase:

- `no-season`: no persisted season row can be selected.
- `registration`: the selected season has a configured registration deadline in the future.
- `completed`: the selected season has at least one tournament and every tournament is persisted as `completed`/`cancelled` or has `endDate < now`.
- `in-season`: every other selected-season state, including a season with no tournaments.

Current-season selection is calendar based, not `startDate <= now <= endDate`. `appState` takes the first season returned for the current calendar year; `getCurrentSeason` likewise takes the first row from the `by_year` index. Neither path sorts duplicate current-year rows by season number. Only the no-current-year fallback sorts by latest year and then highest number.

## Enforced invariants, units, and boundaries

- IDs, not labels, join persisted entities. A tournament references exactly one season, tier, and course; a tour card references one season, tour, and member.
- A tour card is unique only per member/tour/season in mutation logic. The backend permits one member to hold cards on multiple tours in the same season.
- Tier records are the award source. Points and payouts must not be hardcoded when tier data exists.
- Money—tour buy-ins, tier payouts, team/tour-card earnings, accounts, and transactions—is integer cents.
- Team and golfer `score` values are relative to par; round fields are gross strokes. Timestamps and `courses.timeZoneOffset` are milliseconds.
- Playoff recognition is currently name based: several paths treat a tier or tournament as a playoff when its label contains `playoff`. Renaming is therefore a behavior change until an explicit persisted flag replaces this convention.
- Cancelled tournaments are excluded from pick-window selection and satisfy the phase-completion test. Active, next-event, and leaderboard-default date fallbacks do not consistently exclude them; see [known gaps](../KNOWN_GAPS.md).

## UI and public behavior

- `/` is the clubhouse: current schedule, registration, countdown, account alert, role badge, saved-data freshness, and no-season/completed fallbacks.
- `/rulebook` combines static `ruleList` copy with live tier distributions and the current persisted schedule. Static sentences do not update automatically when backend logic changes.
- `/tournament` selects an event and competition from URL search state and serves pre-tournament or leaderboard views.
- `/standings` selects season and tour through URL search state.
- `/history` currently renders only “Season history is coming soon”; backend history reads should not be described as a finished history surface.

Public reads use explicit projectors for seasons, tours, tiers, courses, tournaments, teams, golfers, standings, and members. Viewer and admin DTOs intentionally expose more than public DTOs.

## Writes and downstream effects

Configuration changes can alter registration, grouping, awards, playoff qualification, reminders, and settlement eligibility. Treat a configured season as a graph, not isolated rows.

Canonical competition flow is:

```text
field and groups -> roster -> live scoring -> completed result
                 -> standings contribution -> materialized standings
                 -> playoff carryover/badges/notifications -> settlement
```

Corrections to completed results require downstream standings and badge rebuilding. Season/tour/tournament imports and repairs are admin-only and should be bounded, idempotent, and audited where sensitive.

## Failure and recovery

`appState` refreshes every 15 minutes and schedules exact tournament-start work. It is a public navigation/display cache, so it can briefly lag. Mutations that enforce registration, pick, privacy, or settlement boundaries use server time and canonical records; never authorize from cached phase alone.

Missing or inconsistent configuration can make a screen unavailable even when related rows exist. Repair the upstream entity first, then rebuild dependent read models in dependency order. See the data-repair runbook before production work.

## Authorization and privacy

- Server functions derive identity and role from Clerk/Convex auth; client-supplied member IDs do not establish authority.
- Public league results expose display-safe identity only. Email, Clerk ID, balance, friends, subscriptions, and operational state stay in viewer/admin DTOs.
- Admin imports, rebuilds, financial writes, member status changes, and operational diagnostics require server-side admin checks.
- A public schedule or leaderboard is not authority to reveal a pre-start roster; roster privacy has its own exact start boundary.

## Focused tests

- `convex/hardening.test.ts`: public DTOs, bounded reads, identity, roster privacy, registration, and authorization
- `convex/utils/publicDtos.test.ts`: explicit public projections
- `convex/functions/tournaments.test.ts`: tournament default selection and group readiness
- `convex/functions/readModels.test.ts`: exact live-sync boundary rescheduling; current-season and public-phase derivation are not directly covered
- `src/utils/tourCardRegistration.test.ts`: registration display timing
- `convex/functions/cronJobs.test.ts`: provider tournament timeline and persisted tournament states

## Reconciliation notes

- `src/utils/rules.ts` says groups finalize Monday morning; the enforced schedule is Monday at 17:00 UTC.
- Its 16-event names are an intended template, not proof of the configured schedule.
- The home registration UI moves to a registered state after finding a member's first card, although the backend permits cards on multiple tours. Product intent for multi-card self-service needs confirmation.
- `courses.timeZoneOffset` is used as a millisecond offset for 7 p.m. local reminders but its unit is not described by the schema field name.

## Related links

- [Tournament lifecycle](./TOURNAMENT_LIFECYCLE.md)
- [Registration and rosters](./REGISTRATION_AND_ROSTERS.md)
- [Scoring](./SCORING.md)
- [Standings and playoffs](./STANDINGS_AND_PLAYOFFS.md)
- [Data model](../architecture/DATA_MODEL.md)
- [Backend architecture](../architecture/BACKEND.md)
- [Data repairs](../operations/DATA_REPAIRS.md)
