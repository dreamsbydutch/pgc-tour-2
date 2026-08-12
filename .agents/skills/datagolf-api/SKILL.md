---
name: datagolf-api
description: Select, trace, diagnose, test, or add DataGolf API integrations for PGC Tour. Use for endpoint capability, authentication, tournament-lifecycle timing, fields and statistics, live or historical synchronization, provider identity, retries, and wired-versus-unwired support.
---

# DataGolf API

Read `docs/LEAGUE_AND_APP_GUIDE.md` before changing tournament behavior. DataGolf owns provider-side field, golfer performance, and event-result data; PGC owns its local lifecycle and league calculations. Use `$golf-scoring-czar` when combining strokes, to-par values, or team averages.

## Access and safety

- Base: `https://feeds.datagolf.com`; JSON requests add server-only `DATAGOLF_API_KEY` as `key`.
- Current shared fetch: 30-second timeout, three retries, runtime validation, explicit auth errors.
- Published limit: 45 requests/minute globally, with a five-minute suspension when exceeded. Avoid per-player fan-out.
- Verify the current catalog and subscription entitlement at <https://datagolf.com/api-access> before adding an endpoint.
- Validate event name before persistence; use the local DataGolf `tournament.apiId` for historical calls; never expose the key.

## PGC-wired endpoints and lifecycle

| Endpoint                                                   | Timing                                                           | PGC use                                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `/get-player-list`                                         | Explicit directory work only                                     | Helper exists but currently has no caller: IDs, names, country, amateur status.                                                              |
| `/field-updates?tour=pga`                                  | Monday 17:00 UTC grouping; static/forced sync                    | Field, course, ranks, tee times, waves, start holes. Provider WD flags are not retained in PGC’s normalized field player.                    |
| `/preds/get-dg-rankings`                                   | Monday 16:00 UTC refresh; grouping/static sync                   | Top-500 DG rank, `dg_skill_estimate`, OWGR, identity, country.                                                                               |
| `/preds/in-play?tour=pga&dead_heat=no&odds_format=percent` | Adaptive sync: ~4 min live, ~12 min active; failures 8/16/30 min | Authoritative position, current/today/thru, R1–R4, cut and finish probabilities, `last_update`. DataGolf publishes about every five minutes. |
| `/historical-raw-data/rounds`                              | After local end; prior-event repair                              | Final round strokes, course par, tee times, status, traditional/SG stats, event completion.                                                  |
| `/historical-event-data/events`                            | Completion/repair                                                | Finish, earnings, FedEx Cup points, DG points; earnings resolve the PGC first-place tiebreak.                                                |
| `/preds/live-hole-stats?tour=pga`                          | UI request within ±7 days                                        | Current/latest-round hole par, yardage, average, players through, and scoring distribution; never golfer score persistence.                  |

At exact tournament start, the adaptive chain uses leases and a 30-minute repair cron. If `last_update` is unchanged, skip DataGolf rewrites but still let ESPN refresh. Static feeds normally stop during active polling. Historical feeds are fetched post-end until captured; `updatePreviousTournament` is the admin repair path after the chain stops.

## Complete provider catalog

This compact catalog reflects the official page checked 2026-08-12. “Unwired” means DataGolf documents it but PGC does not call it.

- General: `/get-player-list` (helper only), `/get-schedule` (unwired), `/field-updates` (wired).
- Models: `/preds/get-dg-rankings` (wired); `/preds/pre-tournament`, `/preds/pre-tournament-archive`, `/preds/player-decompositions`, `/preds/skill-ratings`, `/preds/approach-skill`, `/preds/fantasy-projection-defaults` (unwired).
- Live: `/preds/in-play` (wired), `/preds/live-hole-stats` (wired on demand), `/preds/live-tournament-stats` (unwired; dormant local types/validator), `/preds/live-strokes-gained` (provider-deprecated; dormant validator).
- Betting: `/betting-tools/outrights`, `/betting-tools/matchups`, `/betting-tools/matchups-all-pairings` (unwired).
- Historical raw: `/historical-raw-data/event-list` (unwired), `/historical-raw-data/rounds` (wired).
- Historical event: `/historical-event-data/event-list` (unwired), `/historical-event-data/events` (wired).
- Historical odds: `/historical-odds/event-list`, `/historical-odds/outrights`, `/historical-odds/matchups` (unwired).
- Historical DFS: `/historical-dfs-data/event-list`, `/historical-dfs-data/points` (unwired).

## Interpret fields correctly

- `current_score`: golfer tournament cumulative relative to par.
- `today`: current-round relative to par through `thru`; `thru` is hole progress.
- `R1`–`R4` and historical `round.score`: gross strokes; convert with `score - course_par` per round.
- `make_cut`, `top_5`, `top_10`, `top_20`, `win`: probabilities in requested `percent` format.
- `current_pos`: position/status text, not score.
- `earnings`, `fec_points`, `dg_points`: money and two distinct point systems. PGC currently passes the numeric earnings feed directly into the ten-golfer tiebreak; finite zero is present, non-finite/missing is unresolved.
- Live tournament stats, if wired later: SG putting/ARG/approach/OTT/T2G/ball-striking/total plus distance, accuracy, GIR, proximity, scrambling, great/poor shots.
- Live hole `avg_score - par`: hole difficulty relative to par.

## Change the integration

Trace endpoint → `convex/utils/datagolf.ts` fetch/normalization → `convex/functions/datagolf.ts` action → `convex/functions/utils.ts` join → `convex/functions/cronJobs.ts` lifecycle/persistence → consumers. Types live in `convex/types/datagolf.ts`, validators in `convex/validators/datagolf.ts`, schedules in `convex/crons.ts`/`readModels.ts`, and hole stats in `tournamentCourseStats.ts`.

When adding/changing a feed: confirm capability and entitlement; distinguish wired support from dormant types; validate `unknown`; normalize names/timezones; guard event and golfer identity; define trigger, cadence, unchanged marker, retries, repair, and idempotent bounded writes; then add fixture-driven tests for valid, partial, malformed, mismatched, stale, and corrected responses. Recompute every downstream score, award, standing, and read model affected by a correction.
