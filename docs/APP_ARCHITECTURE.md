# PGC App Architecture

This document defines the durable structure of the PGC application. It explains
where responsibilities belong and how data moves through the system without
cataloguing every file.

## System overview

PGC is a TanStack Start and React application backed by Convex.

```text
Browser route
  -> page component
  -> frontend hook
  -> typed Convex query/mutation/action
  -> indexed Convex data
  -> UI-ready hook result
  -> rendered component
```

The main services are:

- **TanStack Start, TanStack Router, React, and Vite** for the web application.
- **Convex** for persisted data, server functions, scheduled work, and live
  updates.
- **Clerk** for authentication; Convex validates Clerk-issued JWTs.
- **DataGolf** for fields, rankings, and tournament data.
- **ESPN** for hole-by-hole scorecards and identity reconciliation.
- **Brevo** for operational league email.
- **PostHog** for browser analytics when configured.
- **Vercel** for the frontend deployment; Convex is deployed separately.

## Repository map

| Path                 | Responsibility                                                       |
| -------------------- | -------------------------------------------------------------------- |
| `src/routes/`        | File-based routes and URL state                                      |
| `src/components/`    | UI rendering and composition                                         |
| `src/hooks/`         | Frontend data access, mutations, stateful workflows, and view models |
| `src/utils/`         | Small reusable pure helpers                                          |
| `src/types/`         | App-owned frontend types and interfaces                              |
| `src/convex/`        | Typed Convex client exports and provider integration                 |
| `src/styles.css`     | Global styles                                                        |
| `convex/functions/`  | Public and internal server operations                                |
| `convex/utils/`      | Reusable backend helpers                                             |
| `convex/types/`      | Backend and integration types                                        |
| `convex/validators/` | Reusable backend input validators                                    |
| `convex/schema.ts`   | Persisted data model and indexes                                     |
| `convex/crons.ts`    | Recurring job definitions                                            |
| `scripts/`           | Quality, build-budget, and deployment helpers                        |
| `email-templates/`   | Source templates for league email                                    |
| `public/`            | Static browser and PWA assets                                        |

`src/lib/` is a legacy location still used by existing code. Do not add new
general-purpose logic or app-owned types there. Move touched code toward
`src/utils/` and `src/types/` when the scope is reasonable. Existing route and
component files also contain some legacy fetching and view-model logic; their
presence is not a pattern to copy.

Do not hand-edit generated files:

- `src/routeTree.gen.ts`
- `convex/_generated/`

## Frontend boundaries

The required dependency direction is:

```text
routes -> components -> hooks -> utils
                    \----------> types
             hooks ------------> types
             utils ------------> types
```

Types may be imported by any frontend layer. Reverse dependencies are not
allowed.

### Routes

Routes validate parameters and search state, perform minimal access gating, keep
the URL synchronized, and render page-level components. They must stay thin:
no direct Convex reads or writes, business calculations, or complex UI
composition. `src/routes/__root.tsx` is the framework-required exception for the
document shell and provider wiring.

The user-facing routes are:

- `/` — home dashboard
- `/tournament` — picks, PGC leaderboard, and PGA leaderboard
- `/standings` — season and playoff standings
- `/history` — prior results
- `/rulebook` — league rules and tier distributions
- `/account` — member account and transactions
- `/admin` — administrative workflows

### Components

Everything under `src/components/` renders UI. Components may compose other
components and call app hooks, but they must not fetch data directly or contain
business/data-transformation logic.

The component subfolders communicate presentation scope, not permission to own
data logic:

- `ui/` — reusable primitives and composites
- `displays/` — domain-specific presentational sections
- `widgets/` — focused interactive UI
- `facilitators/` — page-level composition

Import components through the existing barrels: `@/ui`, `@/displays`,
`@/widgets`, and `@/facilitators`. Do not deep-import through
`@/components/...`.

### Hooks, utilities, and types

- Hooks own Convex calls, mutations, stateful workflows, derived data, sorting,
  grouping, and UI-ready view models.
- Utilities are small, reusable, preferably pure functions. They do not render
  UI or fetch data.
- App-owned TypeScript types live in `src/types/`; do not redefine them inside
  components, hooks, or utilities.

Local presentation state such as an open dialog or focused tab may remain in a
component. If a calculation affects league behavior or could be reused, it does
not belong there.

## Backend boundaries

Convex function type must match the work:

- `query` / `internalQuery` for reads.
- `mutation` / `internalMutation` for transactional writes.
- `action` / `internalAction` for external or nondeterministic work.

Public functions are callable by the client. Scheduled and server-only
workflows must use internal functions. Every public argument is validated.
Sensitive operations derive identity from `ctx.auth`; they do not trust a
client-supplied member or Clerk ID. Role checks use the member record and happen
on the server.

Domain functions live in `convex/functions/`. Reusable server helpers belong in
`convex/utils/`, and shared validators belong in `convex/validators/`. Prefer
indexed access and bounded reads. A hot page may have one reusable read-model
query to avoid browser-side N+1 requests.

## Data model

The authoritative definitions and indexes are in `convex/schema.ts`. The core
league relationship is:

```text
season
  -> tours -> tour cards -> tournament teams
  -> tiers -> tournaments -> tournament golfers
  -> courses
```

The main records have distinct jobs:

- **Member** — authenticated person, role, balance, and friend relationships.
- **Season** — league year/edition and its registration dates.
- **Tour** — a competition within a season, including buy-in and playoff
  allocation.
- **Tour card** — one member's competitive identity on one tour for one season;
  it holds aggregate standings.
- **Tier** — position-indexed points and payout arrays.
- **Tournament** — scheduled event, course, tier, status, and synchronization
  state.
- **Golfer** — stable external golfer identity.
- **Tournament golfer** — tournament-specific group, tee time, score, position,
  usage, and earnings.
- **Team** — a tour card's 10 selected golfer IDs and its computed tournament
  result.
- **Transaction** — member ledger movement. Monetary values are integer cents.

Operational records include `appState` for the public timeline,
`majorChampionBadges` for a materialized display model, `syncRuns` for job
leases/history, `espnIdentityAudit` for unresolved external identities,
`auditLogs`, and `pushSubscriptions`.

Keep tournament-specific facts on tournament-scoped records. Do not place a
group, tee time, live score, or event finish on the global golfer record.
Denormalized team identity fields must remain consistent with the linked tour
card when written.

## Read and write flow

Public screens should use bounded, screen-oriented queries such as the viewer
bootstrap, home dashboard, standings index, rulebook view, and tournament
leaderboard view. The viewer bootstrap contains only the signed-in member's
private context; public dashboard data must remain viewer-independent.

Writes follow this sequence:

1. Authenticate and authorize on the server.
2. Validate ownership and league invariants.
3. Perform the transactional mutation.
4. Update denormalized/materialized data or schedule its rebuild.
5. Record an audit entry for sensitive member or admin changes.

Tournament synchronization is a special pipeline described in
[LEAGUE_AND_APP_GUIDE.md](LEAGUE_AND_APP_GUIDE.md).

## Engineering invariants

- Store money in cents and format it at the presentation boundary.
- Use indexes for recurring access patterns; avoid unbounded `.collect()` in
  public hot paths.
- Keep scheduled jobs idempotent, leased, retry-safe, and internal.
- Preserve privacy: public member responses expose display-safe fields only.
- Do not introduce new client-trusted identity or role checks.
- When completed results change, rebuild every downstream standing or
  materialized view affected by the change.
- Add focused tests around business boundaries, not only happy-path rendering.
- Run the repository quality pipeline before release.
