# Tournament Lifecycle

## Purpose and current status

This lifecycle turns a configured tournament into a selectable field, an exact pick deadline, a live competition, and a finalized result. DataGolf is authoritative for the field, tournament status, scores, positions, and historical earnings used by the first-place tiebreak. ESPN is a best-effort enhancement for hole-by-hole scorecards.

The lifecycle is automated and restartable. Scheduled work coordinates through `appState`, `syncRuns`, and `tournamentSyncState`; a missing provider update should degrade freshness, not silently manufacture a completed result.

## Source paths

- Persisted model and schedules: `convex/schema.ts`, `convex/crons.ts`
- Lifecycle orchestration and scoring sync: `convex/functions/cronJobs.ts`
- Public timeline and exact boundary scheduling: `convex/functions/readModels.ts`
- Default tournament/read models: `convex/functions/tournaments.ts`
- Run and per-event state: `convex/functions/syncRuns.ts`, `convex/functions/tournamentSyncState.ts`
- Provider clients: `convex/functions/datagolf.ts`, `convex/functions/espnGolf.ts`, `convex/utils/datagolf.ts`, `convex/utils/espnGolf.ts`
- Tournament UI: `src/routes/tournament.tsx`, `src/hooks/useTournamentPage.ts`, `src/components/facilitators/TournamentPage.tsx`

## Identities and state flow

The persisted `tournaments.status` is optional and may be `upcoming`, `active`, `completed`, or `cancelled`. Some timeline and default-selection branches also use dates even when a status is present. That keeps stale rows visible, but the current fallbacks do not consistently exclude cancelled events.

```text
configured upcoming event
  -> daily golfer directory/rankings
  -> field import and five ranking groups
  -> four-day pick window
  -> 30-minute preflight and exact first-tee boundary
  -> active sync: prestart / round live / round closed
  -> overlapping-feed protection / completion hold
  -> completed or cancelled
```

The screen queries resolve their default in two layers:

1. A valid explicit tournament from the URL wins.
2. Without one, `appState.activeTournamentId ?? appState.nextTournamentId` chooses one cached ID. If that row resolves, it is passed to the selector as its explicit candidate and wins immediately.
3. Only when neither candidate resolves does the selector choose the first persisted-`active` row, then the first row active by dates, then arbitrate between the most recently ended row and the next future row.

That final helper keeps the most recently ended row for up to 72 hours when a future row exists without real positive-number groups, hands off early when groups exist, and chooses the future row at 72 hours. Its “ended” and “future” filters use dates rather than `status`. Because a cached next event normally short-circuits the helper, the 72-hour/group-aware policy is not guaranteed by the wired screen queries.

## Enforced invariants, units, and boundaries

- Picks are open on the half-open interval `[startDate - 4 days, startDate)`. `Date.now() >= startDate` closes writes and pre-start roster privacy.
- The golfer directory and rankings refresh daily at 15:00 UTC. Next-event grouping is scheduled Monday at 17:00 UTC and retries twice at one-hour intervals.
- Grouping uses DataGolf field/ranking data and defined shares/caps; DataGolf player ID `18417` is explicitly excluded.
- A late field entrant is stored and visible but remains ungrouped until a valid grouping assigns it. Ungrouped golfers cannot be picked.
- During an open pick window, preflight runs every 30 minutes against the lightweight field feed. A newly discovered opening tee time can move the exact start boundary.
- Active synchronization runs every 4 minutes when `livePlay` is true and every 12 minutes while the tournament is active but play is not live. Failures back off to 8, 16, then 30 minutes.
- The feed can expose two rounds at once. The earliest unfinished round remains the public scoring window; a later round is not published early.
- Completion is held when a first-place score tie lacks complete roster earnings or has equal combined roster earnings. Finalization resumes only after the tie can be resolved.

Canonical app timestamps and delays are milliseconds. Round tee-time fields still accept legacy strings, and provider timestamp/version markers remain provider values rather than user-facing clocks.

## UI and public behavior

`/tournament` canonicalizes `tournamentId`, `tourId`, and regular/playoff variant in the URL. Upcoming events with pre-tournament data render field, groups, existing picks, and pick controls; active/completed events render PGC and PGA leaderboards plus available scorecards.

The page has explicit loading and not-found states and can label saved data as stale while connectivity recovers. Public shells and leaderboards are bounded, display-safe DTOs. Before the exact start instant, other members' rosters are omitted; after it, team details can be revealed.

The DataGolf pick pool is currently supplied by `getTournamentLeaderboardView` through `useTournamentPage`. The separate `getTournamentPickPool` operation exists but is not the current page caller.

## Writes and downstream effects

- Field/ranking sync upserts `golfers` and event-specific `tournamentGolfers`.
- Group creation writes `tournamentGolfers.group`; it does not send mail. Separate preview/test/bulk groups-email functions exist, but no current frontend or scheduled caller invokes them.
- Preflight may update the tournament opening time and schedule the exact live-sync boundary.
- Live sync updates tournament status, round/live flags, golfer rows, team scores, positions, awards, scorecards, sync markers, and run diagnostics.
- Completion publishes final notifications, upserts standings contributions/rows, updates legacy tour-card totals, and rebuilds champion badges when applicable.
- The Canadian Open uses a special maple badge logo rather than the ordinary tournament logo.

## Failure and recovery

`syncRuns` records `running`, `succeeded`, `skipped`, `failed`, or `abandoned`; `tournamentSyncState` records per-event attempts, successes, unchanged successes, and failures. Leases prevent duplicate chains, and a 30-minute repair cron recovers a lost adaptive-sync link.

Provider payloads are validated defensively. Partial ESPN data leaves scorecards incomplete without overriding DataGolf totals. Missing identities are recorded in `espnIdentityAudit`; automatic matching can resolve some records, but there is no wired public/admin identity-resolution screen.

Do not force completion to clear a stale UI. Inspect run state, provider identity, round publication, and first-place hold reason, then repair the canonical input and rebuild downstream models.

## Authorization and privacy

Routine provider actions and scheduled mutations are internal. Administrative imports, invocations, diagnostics, and repairs require a server-side admin identity and should be audited.

Tournament and golfer results are public display data. Member email, Clerk identity, private account data, and pre-start opponent rosters are not. Exact roster privacy is enforced in Convex queries rather than inferred in the browser.

## Focused tests

- `convex/functions/cronJobs.test.ts`: adaptive cadence, preflight eligibility, grouping/scoring batches, round windows, replacement, ties, and persisted status
- `convex/functions/tournaments.test.ts`: selector-helper precedence, 72-hour handoff, and real-group readiness; it does not exercise the cached `appState` query layer
- `convex/functions/readModels.test.ts`: exact live-sync boundary scheduling
- `convex/golfersDirectory.test.ts`: complete directory/ranking synchronization
- `convex/utils/espnGolf.test.ts`: parsing, identity, partial scorecards, corrections, and synthesis
- `convex/hardening.test.ts`: scorecard isolation/fallback, bounded tournament reads, and exact pre-start privacy

## Reconciliation notes

- `docs/LEAGUE_AND_APP_GUIDE.md` previously described a four-minute cadence for every active event. Enforced code uses four minutes only during live play and twelve minutes while merely active.
- Organizer copy says groups finalize “Monday morning”; the cron is Monday 17:00 UTC.
- Some legacy public tournament queries coexist with the screen-oriented read models. Document actual callers before removing or extending an endpoint.
- The code uses `https://site.web.api.espn.com/...`; older skill text naming `site.api.espn.com` is stale because that host rejects the Convex workload.

## Related links

- [League structure](./LEAGUE_STRUCTURE.md)
- [Registration and rosters](./REGISTRATION_AND_ROSTERS.md)
- [Scoring](./SCORING.md)
- [Integrations](../architecture/INTEGRATIONS.md)
- [Backend architecture](../architecture/BACKEND.md)
- [Admin and automation](../operations/ADMIN_AND_AUTOMATION.md)
- [Security, performance, and incidents](../operations/SECURITY_PERFORMANCE_AND_INCIDENTS.md)
