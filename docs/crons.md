# Cron jobs (Convex)

This app runs scheduled background jobs using **Convex Cron**.

## Where crons are defined

- Scheduler registration: [convex/crons.ts](../convex/crons.ts)
- Implementations:
  - Live DataGolf sync: [convex/functions/cronJobs.ts](../convex/functions/cronJobs.ts) + [convex/functions/cronJobsInternal.ts](../convex/functions/cronJobsInternal.ts)
  - Create groups: [convex/functions/cronGroups.ts](../convex/functions/cronGroups.ts) + [convex/functions/cronGroupsInternal.ts](../convex/functions/cronGroupsInternal.ts)
  - Update teams: [convex/functions/cronTeams.ts](../convex/functions/cronTeams.ts) + [convex/functions/cronTeamsInternal.ts](../convex/functions/cronTeamsInternal.ts)
  - Backfill standings (old teams): [convex/functions/cronOldTeams.ts](../convex/functions/cronOldTeams.ts)

## Scheduled jobs

All intervals below are defined in [convex/crons.ts](../convex/crons.ts).

### datagolf_live_sync (every 2 minutes)

- Calls: internal.functions.cronJobs.runDataGolfLiveSync
- Purpose: Fetch DataGolf feeds and update `golfers`, `tournamentGolfers`, and tournament live flags.
- Self-gating: exits early if there is no active tournament.
- Depends on: `DATAGOLF_API_KEY` in Convex env.
- Tour: PGA only (hardcoded).

### update_teams (every 2 minutes)

- Calls: internal.functions.cronTeams.runUpdateTeamsForActiveTournament
- Purpose: Recompute team round totals / tee times / score + assign positions + compute points/earnings.
- Self-gating: exits early if there is no active tournament or there are no teams.

### recompute_standings (hourly)

- Calls: internal.functions.cronJobs.recomputeStandingsForCurrentSeason
- Purpose: Roll up season totals for `tourCards` from completed teams.

### create_groups_for_next_tournament (every 12 hours)

- Calls: internal.functions.cronGroups.runCreateGroupsForNextTournament
- Purpose: Pre-tournament grouping into 5 groups using DataGolf field updates + rankings.
- Self-gating: exits early if tournament already has tournament golfers.

## Manual / one-off jobs

### Backfill standings for a specific season (old update-old-teams)

This replaces the legacy `cron/update-old-teams` endpoint.

Run in dev:

- `npx convex run internal.functions.cronOldTeams.recomputeStandingsForSeason '{"seasonId":"<SEASON_ID>","includeIncomplete":false}'`

Notes:

- `includeIncomplete=false` matches the live standings rollup behavior (only completed teams).
- Use `includeIncomplete=true` only if you know you want partial tournaments included.

## Legacy cron parity

The old root-level `cron/` folder is Next.js-style and is not used by the TanStack Start + Convex deployment.

Mapping:

- cron/create-groups -> Convex: internal.functions.cronGroups.runCreateGroupsForNextTournament
- cron/update-golfers -> Convex: internal.functions.cronJobs.runDataGolfLiveSync
- cron/update-teams -> Convex: internal.functions.cronTeams.runUpdateTeamsForActiveTournament
- cron/update-standings -> Convex: internal.functions.cronJobs.recomputeStandingsForCurrentSeason
- cron/update-old-teams -> Convex: internal.functions.cronOldTeams.recomputeStandingsForSeason
- cron/update-all-accounts -> (legacy file was empty; no replacement)
