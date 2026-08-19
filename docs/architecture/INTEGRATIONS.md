# External Integrations

PGC treats every external service as a typed, failure-prone boundary. Provider data is validated from `unknown`, identity is reconciled explicitly, secrets stay server-side, and PGC remains authoritative for league calculations and member state.

## Service map

| Service      | PGC use                                                                              | Authentication/configuration                                      | Failure ownership                                                                          |
| ------------ | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Clerk        | Sign-in, identity claims, Convex JWT                                                 | Browser publishable key; server Clerk secret/issuer               | Private UI waits/fails closed; Convex still authorizes every operation                     |
| Convex       | Database, server functions, live queries, scheduler                                  | Deployment selection and URL; Clerk issuer                        | PGC owns schema, functions, jobs, read models, and recovery                                |
| DataGolf     | Golfer directory/rank, field/tee times, live/final tournament facts, hole difficulty | Server-only API key                                               | Authoritative provider tournament totals; PGC validates event/identity and retries/repairs |
| ESPN         | Best-effort golfer hole cells                                                        | No key                                                            | Never blocks or overwrites DataGolf totals; ambiguous identity is audited/skipped          |
| Brevo        | Operational league email                                                             | Server-only API key/template IDs/test recipient                   | Domain sent markers update only after intended send succeeds                               |
| Web Push     | Optional delivery for durable in-app notifications                                   | Server-only VAPID private key/subject; public key reaches browser | Delivery is retryable and expendable; inbox remains the durable message                    |
| PostHog      | Optional privacy-reduced browser analytics                                           | Browser-visible key/ingestion host                                | Analytics must never block product behavior or collect member/domain secrets               |
| Vercel/Nitro | Web and SSR hosting artifact                                                         | Vercel environment/project outside this repo                      | Separate from Convex; deployment ownership/rollback is not fully documented                |

Environment ownership and deployment checks live in [local development](../operations/LOCAL_DEVELOPMENT.md) and [deployment](../operations/DEPLOYMENT.md). Never paste actual values into tests, logs, screenshots, or docs.

## Clerk and Convex identity

`src/components/facilitators/Providers.tsx` requests the Clerk `convex` JWT template and supplies it to `ConvexProviderWithClerk`. `convex/auth.config.ts` validates the configured issuer. `ViewerBootstrapProvider` provisions a member from verified claims and loads private viewer context.

Clerk proves an external subject; the persisted `members` row supplies league role, active state, display identity, balance, and relationships. Client role checks are presentation only. See [members and access](../domain/MEMBERS_AND_ACCESS.md).

## DataGolf

Base requests go to `https://feeds.datagolf.com` with server-only `DATAGOLF_API_KEY`. Shared fetch/normalization lives in `convex/utils/datagolf.ts`, `convex/utils/golfers.ts`, and `convex/functions/datagolf.ts`; orchestration/persistence lives primarily in `convex/functions/cronJobs.ts`.

| Feed                            | Wired use and timing                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `/get-player-list`              | Complete golfer-directory input in the daily 15:00 UTC directory/rank job; bounded idempotent upserts           |
| `/preds/get-dg-rankings`        | Daily world-rank update and a fresh fetch during Monday grouping                                                |
| `/field-updates?tour=pga`       | Monday 17:00 UTC grouping and a 30-minute opening-tee-time preflight only while the next event's picks are open |
| `/preds/in-play`                | Adaptive tournament sync: 4 minutes in live play, 12 minutes while active/not live, failures at 8/16/30 minutes |
| `/historical-raw-data/rounds`   | Final gross round/stats repair after local event end                                                            |
| `/historical-event-data/events` | Final finish/earnings/points input; roster earnings resolve the PGC first-place tiebreak                        |
| `/preds/live-hole-stats`        | On-demand course-hole difficulty display near the selected event; not golfer score persistence                  |

Before persistence, require compatible event identity and reconcile golfers by DataGolf ID. Missing field/live/historical golfers may be inserted as ungrouped tournament entrants so the PGA leaderboard remains complete without reopening the PGC pick pool. DataGolf `current_score`/`today` are to-par values; `R1`–`R4` and historical round scores are gross strokes.

Endpoint entitlement and provider limits can change. Verify the [official DataGolf API catalog](https://datagolf.com/api-access) before adding a feed; local dormant types do not prove subscription access or a wired caller. Use the `$datagolf-api` skill for provider work and `$pgc-golf-scoring` for league calculations.

## ESPN golf scorecards

The current endpoint host is:

```text
https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard?dates=YYYYMMDD
```

Use the local tournament start date, not “today.” Fetch in an internal action, parse the minimal nested event/competitor/round/hole boundary, and preserve valid siblings when other cells are malformed.

Event and golfer matching prefer saved ESPN IDs. Conservative normalized-name matching must produce one unique compatible result; ambiguity/conflict creates or updates `espnIdentityAudit` instead of guessing. Persist scorecards by tournament+golfer, merge corrections without deleting omitted cells, and skip order-only writes.

ESPN supplies display hole cells only. DataGolf remains authoritative for golfer/tournament totals, status, finish, earnings, and points. PGC may synthesize missing WD/DQ penalty holes solely to reconcile an eligible first/second-round display to the authoritative +8 round; synthetic cells never update authoritative totals. Multi-course inference remains limited.

Core paths: `convex/functions/espnGolf.ts`, `convex/utils/espnGolf.ts`, `convex/types/espnGolf.ts`, `src/utils/teamHoleScorecard.ts`, and their focused tests. Use `$espn-golf-scorecards` for changes.

## Brevo email

`convex/functions/emails.ts` builds recipient previews and performs admin-authorized test/bulk sends. Template IDs and `BREVO_TEST_TO` come from the Convex/server environment. `email-templates/` holds maintained source HTML for provider templates; the app does not read those files at runtime.

Bulk sends require a server-side lease/cooldown, stable target rules, and a test path. Update tournament/domain sent markers only after the intended request succeeds. Never send to the league without explicit user authorization. See [messaging](../domain/MESSAGING_AND_NOTIFICATIONS.md).

## In-app notifications and web push

Publishing creates a durable inbox event/notification first. Eligible enabled subscriptions receive separate `notificationDeliveries`; `convex/functions/pushDelivery.ts` performs VAPID-authenticated HTTP requests. Retryable HTTP failures back off, expired endpoints are removed, and missing push configuration must not corrupt the inbox.

`public/sw.js` displays the push and navigates an existing/new window to a normalized same-app route. It is not an offline cache worker. Push delivery ownership hardening has a [known implementation gap](../KNOWN_GAPS.md#push-delivery-ownership-checks-are-incomplete).

## PostHog and browser dependencies

Analytics initializes only when configured, sends explicit sanitized page/events, and omits automatic URL-rich capture. `VITE_POSTHOG_DEBUG` is local-only. Bundle guards require PostHog outside the initial graph.

Google Fonts, Clerk challenge/telemetry/image hosts, Convex WebSockets, PostHog ingestion, and the current remote league image host appear in `vercel.json`. The CSP is report-only while nonce work remains unresolved; review actual reports before changing sources.

## Integration change checklist

For any provider change, define capability/entitlement, secret location, request timeout/retry/rate behavior, runtime validation, event/entity identity, units/timezone, unchanged marker, persistence ownership, bounded batching, idempotency/lease, downstream corrections, operator recovery, and sanitized fixtures. Test valid, empty, partial, malformed, stale, mismatched, duplicate, and corrected data where applicable.

Related: [tournament lifecycle](../domain/TOURNAMENT_LIFECYCLE.md), [scoring](../domain/SCORING.md), [admin automation](../operations/ADMIN_AND_AUTOMATION.md), and [known gaps](../KNOWN_GAPS.md).
