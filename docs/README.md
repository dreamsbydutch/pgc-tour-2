# PGC Tour Wiki

This wiki is the durable map of the PGC product, league, code, and operations. It is written for members of the project and coding agents: start broad, follow links into the affected domain, then verify the current implementation at the cited source paths.

The wiki documents both **intended behavior** and **currently enforced behavior**. Those are not assumed to match. [Known gaps](KNOWN_GAPS.md) records confirmed contradictions, unwired capabilities, and operational unknowns.

## Choose a reading path

| If you need to…                  | Start with                                                                           | Then read                                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Understand what PGC is building  | [Product and end goal](PRODUCT.md)                                                   | [Surfaces and states](product/SURFACES_AND_STATES.md), [glossary](reference/GLOSSARY.md)                                              |
| Change a league rule or outcome  | [League and app guide](LEAGUE_AND_APP_GUIDE.md)                                      | The affected page under [Domains](#domains) and `src/utils/rules.ts`                                                                  |
| Add or refactor application code | [Architecture](APP_ARCHITECTURE.md)                                                  | [Frontend](architecture/FRONTEND.md), [backend](architecture/BACKEND.md), [repository map](reference/REPOSITORY_MAP.md)               |
| Find a feature's code and tests  | [Code map](reference/CODE_MAP.md)                                                    | [Data model](architecture/DATA_MODEL.md) and the matching project skill                                                               |
| Set up or verify the repo        | [Development and operations](DEVELOPMENT_AND_OPERATIONS.md)                          | [Local development](operations/LOCAL_DEVELOPMENT.md), [commands](reference/COMMANDS.md), [quality](operations/QUALITY_AND_TESTING.md) |
| Operate or recover the league    | [Admin and automation](operations/ADMIN_AND_AUTOMATION.md)                           | [Tournament lifecycle](domain/TOURNAMENT_LIFECYCLE.md), [incidents](operations/SECURITY_PERFORMANCE_AND_INCIDENTS.md)                 |
| Deploy or repair data            | [Deployment](operations/DEPLOYMENT.md) or [data repairs](operations/DATA_REPAIRS.md) | Read the authorization boundary before taking action                                                                                  |
| Check whether guidance is stale  | [Known gaps](KNOWN_GAPS.md)                                                          | Compare the cited code, tests, and current git history                                                                                |

## Product

- [Product and end goal](PRODUCT.md) — audience, member/operator journeys, product boundaries, and definition of success.
- [Surfaces and states](product/SURFACES_AND_STATES.md) — every route, access state, URL contract, wired surface, and dormant UI capability.
- [Glossary](reference/GLOSSARY.md) — the identities, score units, states, and operational terms that must not be conflated.

## Domains

- [League structure](domain/LEAGUE_STRUCTURE.md) — seasons, tours, tiers, courses, tournaments, tour cards, and the competition hierarchy.
- [Tournament lifecycle](domain/TOURNAMENT_LIFECYCLE.md) — scheduling, field creation, exact boundaries, adaptive sync, completion, and recovery.
- [Registration and rosters](domain/REGISTRATION_AND_ROSTERS.md) — eligibility, capacity, fees as a side effect, pick validation, privacy, substitution, and playoff inheritance.
- [Scoring](domain/SCORING.md) — strokes and to-par units, 10/5/3-golfer averages, terminal states, positions, ties, points, and payouts.
- [Standings and playoffs](domain/STANDINGS_AND_PLAYOFFS.md) — contributions, rows, movement, qualification, brackets, starting strokes, and carryover.
- [Members and access](domain/MEMBERS_AND_ACCESS.md) — Clerk provisioning, roles, profiles, friends, viewer context, authorization, and public DTO privacy.
- [Finance and settlements](domain/FINANCE_AND_SETTLEMENTS.md) — cent-denominated ledger entries, fees, payments, official earnings, allocations, and audit behavior.
- [Messaging and notifications](domain/MESSAGING_AND_NOTIFICATIONS.md) — in-app inbox, web push, Brevo email, preferences, deduplication, delivery, and recipient safety.

## Architecture

- [Architecture overview](APP_ARCHITECTURE.md) — service map, request/data flow, deployment split, and architectural invariants.
- [Frontend](architecture/FRONTEND.md) — route/component/hook/utility boundaries, providers, URL state, rendering states, PWA behavior, and legacy hotspots.
- [Backend](architecture/BACKEND.md) — Convex function types, authentication, public/internal boundaries, bounded I/O, writes, jobs, and DTOs.
- [Data model](architecture/DATA_MODEL.md) — every table, relationship, canonical/materialized ownership, indexes, and units.
- [Integrations](architecture/INTEGRATIONS.md) — Clerk, DataGolf, ESPN, Brevo, web push, PostHog, Vercel, and failure ownership.

## Operations

- [Development and operations hub](DEVELOPMENT_AND_OPERATIONS.md)
- [Local development](operations/LOCAL_DEVELOPMENT.md)
- [Quality and testing](operations/QUALITY_AND_TESTING.md)
- [Deployment](operations/DEPLOYMENT.md)
- [Admin and automation](operations/ADMIN_AND_AUTOMATION.md)
- [Data repairs](operations/DATA_REPAIRS.md)
- [Security, performance, and incidents](operations/SECURITY_PERFORMANCE_AND_INCIDENTS.md)

## Reference

- [Repository map](reference/REPOSITORY_MAP.md) — source, generated, build, deployment, and import boundaries.
- [Command reference](reference/COMMANDS.md) — exact scripts, prerequisites, side effects, and outputs.
- [Code map](reference/CODE_MAP.md) — domain-to-route/hook/function/table/test/skill lookup.
- [Glossary](reference/GLOSSARY.md)
- [Known gaps](KNOWN_GAPS.md)

## Source-of-truth policy

Different sources answer different questions:

| Question                                           | Source of truth                                                                         |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Organizer-confirmed league intent shown to members | `src/utils/rules.ts`                                                                    |
| Behavior the application enforces today            | Convex functions/utilities, `convex/schema.ts`, and tests                               |
| Frontend behavior and URL/access state             | `src/routes/`, `src/hooks/`, and rendering tests                                        |
| Persisted fields and indexes                       | `convex/schema.ts`                                                                      |
| Recurring and exact-boundary schedules             | `convex/crons.ts`, `convex/functions/readModels.ts`, and `convex/functions/cronJobs.ts` |
| Commands and local gate                            | `package.json` and the scripts it invokes                                               |
| CI-only checks                                     | `.github/workflows/`                                                                    |
| External provider capabilities                     | Provider documentation; local types/validators prove only implemented expectations      |
| Code placement and working rules                   | `AGENTS.md`                                                                             |

When sources disagree, do not overwrite the disagreement with a tidy summary. Add or update a [known-gap entry](KNOWN_GAPS.md), confirm intent where needed, and change every maintained source together when resolving it.

## Documentation contract

- Put a durable fact on one canonical page and link to it elsewhere. Hubs and skills route; they do not carry duplicate volatile catalogs.
- State whether behavior is intended, enforced, wired to a UI, internal-only, dormant, legacy-compatible, or unknown.
- Cite owning source paths and focused tests. Avoid line numbers that churn unless documenting an active investigation.
- Document units, identity scope, time boundaries, authorization, downstream effects, and recovery whenever they matter.
- Update [the code map](reference/CODE_MAP.md) for a new domain surface and [known gaps](KNOWN_GAPS.md) when wiring or limitations change.
- Keep secrets, production exports, real member data, and raw provider payloads out of the wiki.
- Run `npm run docs:check` and Prettier after changing Markdown or skills.
