# Convex I/O budget

## Production baseline

Before deploying the read-model migration, export the previous 7-day and
30-day usage from the Convex dashboard, grouped by function:

- function calls
- database read/write bandwidth
- action and external-fetch egress
- p50/p95 duration

Normalize route-level calls by active browser session and live-sync usage by
active tournament hour. Store the exported report with the release evidence;
do not write per-query telemetry into Convex because that would add database
I/O to every measured request.

## Release targets

- Database I/O: at least 50% below the normalized baseline.
- Function calls per active session: at least 30% below baseline.
- Home: public dashboard plus viewer bootstrap.
- Tournament: public tournament view plus viewer bootstrap.
- Standings: standings index plus viewer bootstrap; history is paginated.
- Rulebook: rulebook view plus viewer bootstrap.
- Active tournament sync remains on a four-minute adaptive chain.

## Client bundle budget

The pre-cleanup shared initial JavaScript baseline was 671,250 bytes. CI caps
the largest shared client chunk at 537,000 bytes, exactly 20% below that
baseline. The current production build is 508,565 bytes (24.2% below the
baseline); route-specific admin code remains in its own chunk.

## Guardrails

`npm run convex:io-check` rejects unbounded `.collect()` calls in the optimized
public hot paths. Pagination endpoints set row and byte limits. Small
configuration tables remain explicitly bounded with `take`.

Configure daily warning limits for function calls, database I/O, and data
egress in the production deployment's Convex dashboard. Set each warning to
the measured daily baseline plus agreed traffic headroom.

Do not configure disable limits until at least one full tournament cycle has
been observed after deployment. Disable limits can pause production.

## Rollout

1. Deploy optional schema fields and dual writes.
2. Run `adminRebuildReadModels` until its cursor reports `isDone`.
3. Run `adminBackfillTournamentGolfers` until complete.
4. Run `adminRebuildMajorChampionBadges` for each retained season.
5. Run `refreshAppState`, then validate counts and sampled leaderboard rows.
6. Deploy optimized frontend reads.
7. Compare the next equivalent tournament window with the stored baseline.
