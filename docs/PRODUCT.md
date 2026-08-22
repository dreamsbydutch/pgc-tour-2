# Product and End Goal

## Product promise

PGC Tour turns a private friends-and-family fantasy golf league into a reliable, self-service clubhouse. A member should be able to understand the season, join an available tour, make valid picks, follow the competition live, see official standings and playoff context, receive useful reminders, understand their balance, and settle earnings without needing an organizer to explain hidden state.

An organizer should be able to run the league through authenticated, reviewable workflows rather than direct database edits: prepare fields, monitor external feeds, recover a tournament, recompute derived state, communicate with members, reconcile money, and audit what happened.

The end goal is not merely a live leaderboard. It is an accurate historical and operational record of the league from registration through season settlement, resilient to partial external data and understandable on a phone.

## People and jobs

| Actor              | Primary jobs                                                                                                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signed-out visitor | Understand the league, current schedule, public results, standings, and rules; sign in when a private action is needed                                                       |
| Member             | Maintain a profile, register a tour card, pay/track balance, submit picks, follow teams and friends, receive updates, inspect official results, and allocate season earnings |
| Moderator          | Use any explicitly moderator-enabled capability; moderator is a server role but currently has little dedicated UI                                                            |
| Administrator      | Operate tournaments, members, messaging, financial entries, settlements, repairs, and observability through server-authorized tools                                          |
| League organizer   | Confirm rule intent, schedules, tiers, payouts, exceptions, and unresolved behavioral decisions                                                                              |

## Canonical member journey

```text
discover league
  -> sign in and provision member
  -> register one or more eligible tour cards
  -> pay/maintain a non-negative account
  -> wait for five tournament groups
  -> submit 2 golfers from each group
  -> follow PGA golfers and PGC team scoring
  -> receive official points, payouts, badges, and standings
  -> qualify for Gold/Silver or finish the regular season
  -> carry one playoff roster through three events
  -> allocate and settle official season earnings
  -> review the durable season history
```

The backend implements most of this flow. The final historical browsing experience is not yet built, and some account/notification capabilities exist behind hooks or Convex functions without a rendered member UI. See [known gaps](KNOWN_GAPS.md).

## Canonical operator journey

```text
configure season/tours/tiers/courses/tournaments
  -> refresh golfer identities and rankings
  -> create tournament field and groups
  -> monitor pick readiness and reminders
  -> start exact-boundary adaptive synchronization
  -> reconcile DataGolf totals and ESPN hole cards
  -> hold or finalize results safely
  -> refresh standings, badges, timeline, and notifications
  -> repair upstream corrections in dependency order
  -> process financial settlements and close the season
```

Every external or sensitive step must be observable, safe to retry, bounded, authorized, and explicit about partial success.

## Product principles

- **Community first.** Preserve the personality and decisions of this league rather than generalizing prematurely into a multi-tenant fantasy platform.
- **Mobile primary, desktop complete.** The PWA is most often used around tournament play; small-screen clarity is the baseline, not a reduced mode.
- **Truth before immediacy.** Show loading, stale, partial, held, and unavailable states honestly. Never fabricate completion from a convenient display value.
- **One meaning per number.** Strokes, relative-to-par values, averages, positions, league points, provider earnings, and ledger cents stay labeled and scoped.
- **Self-service within safe boundaries.** Common member and operator tasks should be obvious; irreversible, financial, bulk-message, and production actions require confirmation and audit.
- **Corrections propagate.** A corrected provider or tournament fact is not finished until every affected award, standing, badge, timeline, and message view is consistent.
- **Fast by design.** Favor bounded server read models, small subscriptions, on-demand detail, intentional bundles, and restrained motion.
- **Simple systems.** Apply YAGNI. Prefer a direct, well-tested workflow over a configurable framework the league does not need.

## Current product boundary

PGC currently models one private community across seasons and tours. DataGolf supplies most tournament facts, ESPN supplies best-effort hole cards, Clerk supplies authentication, Convex owns application state and workflows, Brevo handles operational email, standards-based web push extends the in-app inbox, and Vercel serves the web application.

The code does not establish a public league-creation marketplace, betting product, offline-first score client, generic data warehouse, or fully implemented historical archive. Treat those as outside the current product unless the organizers explicitly choose them.

## What “done” means

A product change is complete when:

1. the member or operator outcome is clear in every applicable lifecycle and access state;
2. server behavior enforces identity, authorization, validation, units, and domain invariants;
3. canonical writes update or schedule all dependent state;
4. partial, stale, duplicate, corrected, and failed external data has an honest path;
5. mobile and desktop behavior, URL/deep-link state, and accessibility remain intentional;
6. focused tests prove the boundary and repository guards pass;
7. the rulebook and canonical wiki page reflect any durable behavioral change; and
8. any unresolved limitation is recorded rather than implied away.

Related: [surfaces and states](product/SURFACES_AND_STATES.md), [league guide](LEAGUE_AND_APP_GUIDE.md), [architecture](APP_ARCHITECTURE.md), and [known gaps](KNOWN_GAPS.md).
