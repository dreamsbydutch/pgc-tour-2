# Cron Jobs and Scheduled Work

Cron schedules are defined in `convex/crons.ts`.

## Jobs in this repo

This repo currently schedules:

- Live tournament sync (interval; self-gated when no active tournament)
- Standings recompute (daily)
- Pre-tournament grouping creation (multiple Monday times)

These cron entries invoke internal Convex functions:

- `internal.functions.cronJobs.runLiveTournamentSync`
- `internal.functions.cronJobs.recomputeStandingsForCurrentSeason`
- `internal.functions.cronJobs.runCreateGroupsForNextTournament`

## Conventions

- Cron jobs should be safe to run multiple times.
- Prefer “self-gating” behavior: exit quickly if there is nothing to do.
- Keep cron handlers internal-only.

## Troubleshooting

If a cron job behaves unexpectedly:

- confirm the internal handler exists and is exported
- ensure required env vars (e.g., external API keys) are present
- check that queries are indexed for scale

See also:

- [external-integrations.md](external-integrations.md)
- [../operations/troubleshooting.md](../operations/troubleshooting.md)
