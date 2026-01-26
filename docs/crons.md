# Cron jobs (Convex)

This app runs scheduled background jobs using **Convex Cron**.

## Where crons are defined

- Scheduler registration: [convex/crons.ts](../convex/crons.ts)
- Implementations: [convex/functions/cronJobs.ts](../convex/functions/cronJobs.ts)

## Scheduled jobs

All intervals below are defined in [convex/crons.ts](../convex/crons.ts).

### datagolf_live_sync (every 2 minutes)

- Calls: internal.functions.cronJobs.runDataGolfLiveSync
- Purpose: Fetch DataGolf feeds and update `golfers`, `tournamentGolfers`, and tournament live flags.
- Self-gating: exits early if there is no active tournament.
- Depends on: `DATAGOLF_API_KEY` in Convex env.
- Tour: PGA only (hardcoded).

### update_teams (every 2 minutes)

- Calls: internal.functions.cronJobs.runUpdateTeamsForActiveTournament
- Purpose: Recompute team round totals / tee times / score + assign positions + compute points/earnings.
- Self-gating: exits early if there is no active tournament or there are no teams.

### recompute_standings (hourly)

- Calls: internal.functions.cronJobs.recomputeStandingsForCurrentSeason
- Purpose: Roll up season totals for `tourCards` from completed teams.

### create_groups_for_next_tournament (every 12 hours)

- Calls: internal.functions.cronJobs.runCreateGroupsForNextTournament
- Purpose: Pre-tournament grouping into 5 groups using DataGolf field updates + rankings.
- Self-gating: exits early if tournament already has tournament golfers.

## Legacy cron parity

The old root-level `cron/` folder is Next.js-style and is not used by the TanStack Start + Convex deployment.

Mapping:

- cron/create-groups -> Convex: internal.functions.cronJobs.runCreateGroupsForNextTournament
- cron/update-golfers -> Convex: internal.functions.cronJobs.runDataGolfLiveSync
- cron/update-teams -> Convex: internal.functions.cronJobs.runUpdateTeamsForActiveTournament
- cron/update-standings -> Convex: internal.functions.cronJobs.recomputeStandingsForCurrentSeason
- cron/update-all-accounts -> (legacy file was empty; no replacement)
