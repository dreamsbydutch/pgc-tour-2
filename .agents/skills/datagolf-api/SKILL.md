---
name: datagolf-api
description: Trace, diagnose, test, or extend PGC DataGolf authentication, endpoint entitlement, player directory, fields, rankings, live or historical payloads, provider identity, retries, and corrections. Use for DataGolf-owned data; PGC scoring and orchestration use their domain skills.
metadata:
  short-description: Work with PGC DataGolf feeds
---

# DataGolf API

Read the [integration architecture](../../../docs/architecture/INTEGRATIONS.md), [admin and automation runbook](../../../docs/operations/ADMIN_AND_AUTOMATION.md), and the relevant [tournament lifecycle](../../../docs/domain/TOURNAMENT_LIFECYCLE.md) or [scoring](../../../docs/domain/SCORING.md) page.

## Scope and handoffs

Own DataGolf endpoint selection, entitlement, server authentication, runtime validation, normalization, provider identity, fetch behavior, and upstream correction handling.

- Use `$pgc-tournament-lifecycle` for `appState`, schedules, leases, status transitions, and admin recovery.
- Use `$pgc-golf-scoring` for strokes, to-par values, team averages, ties, awards, or carryover.
- DataGolf remains authoritative for provider field, golfer-performance, result, earnings, and provider-reported golfer points; PGC owns league calculations.

## Preserve the integration

- Keep `DATAGOLF_API_KEY` server-only and verify the current [DataGolf API catalog and entitlement](https://datagolf.com/api-access) before adding a feed.
- Parse external JSON as `unknown`, validate the smallest boundary, and reject tournament or golfer identity ambiguity before persistence.
- Avoid per-player fan-out, unbounded writes, and rewrites when the provider marker is unchanged.
- Define trigger, cadence, retry, unchanged marker, repair path, and correction cascade for every wired endpoint.

Current wiring to preserve:

- `/get-player-list` and `/preds/get-dg-rankings` run together in the daily 15:00 UTC golfer-directory sync and through its admin action.
- Monday 17:00 UTC grouping fetches `/field-updates` and rankings again.
- During the four-day pick window, the 30-minute tournament preflight may fetch the field to keep the opening tee-time boundary current.
- Live and historical feeds participate in the adaptive tournament chain; timing and ownership live in the lifecycle guide, not in this skill.

## Trace and verify

Trace `convex/utils/golfers.ts` and `convex/utils/datagolf.ts` to `convex/functions/datagolf.ts`, `convex/functions/cronJobs.ts`, `convex/types/datagolf.ts`, `convex/validators/datagolf.ts`, `convex/crons.ts`, persistence, and every downstream consumer.

Use sanitized fixtures for valid, partial, malformed, mismatched, stale, and corrected payloads. Test auth failures, event/golfer identity, idempotent bounded writes, unchanged markers, retries, and every downstream score, award, standing, or read model affected by a correction.
