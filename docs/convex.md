# Convex Backend (PGC) — Architecture & Conventions

This repo uses **Convex** as the backend database + function runtime.

Convex concepts to know:

- **Tables** live in the schema: `convex/schema.ts`.
- **Functions** (server code) live in `convex/` and are one of:
  - `query`: read-only, deterministic, cached by Convex.
  - `mutation`: writes to the database.
  - `action`: can call external APIs / non-deterministic work (e.g. `fetch`).
- The frontend references functions via the generated helper `api` in `convex/_generated/api`.
  - Example: `api.functions.tournaments.getTournaments` maps to the export `getTournaments` in `convex/functions/tournaments.ts`.

> Do not edit `convex/_generated/*` directly. Regenerate via `npx convex dev`.

## Related docs

- [Cron jobs](./crons.md)

---

## 1) Project structure

- `convex/schema.ts`
  - All tables, field validators, and indexes.
  - Some tables include legacy/back-compat fields for historical data.

- `convex/functions/*.ts`
  - Domain modules: `members`, `seasons`, `tours`, `tiers`, `courses`, `tournaments`, `teams`, `golfers`, `tourCards`, `transactions`.
  - Each module generally follows a **single CRUD API per resource** with a rich `options` object.

- `convex/functions/cronJobs.ts`
  - Scheduled job implementations (DataGolf live sync, create groups, update teams, recompute standings) plus the admin cron runner.

- `convex/functions/emails.ts`
  - Email workflows and Brevo integration helpers.

- `convex/functions/datagolf.ts`
  - DataGolf API integration.
  - Uses **actions** (not queries/mutations) because it calls `fetch` and depends on `process.env.DATAGOLF_API_KEY`.

- `convex/utils.ts`
  - Shared utilities (batch processing, validation helpers).

- `convex/types/types.ts`
  - Shared Doc types, “Enhanced\*” types, and options types.

---

## 2) Data model overview

### Core entities

- `members`
  - Represents users; linked to Clerk via `clerkId`.
  - Has `account` balance (cents).
  - No soft-delete flag; deletes are hard deletes.

- `seasons`
  - Organizes everything by season (year + number).
  - No soft-delete flag; deletes are hard deletes.

- `tours`
  - Belongs to a `seasonId`.
  - Has `buyIn` (cents) and `playoffSpots`.

- `tiers`
  - Belongs to a `seasonId`.
  - Contains `payouts` (cents) and `points` arrays.

- `courses`
  - Master course metadata, keyed by `apiId`.

- `tournaments`
  - Belongs to a `seasonId`, `tierId`, and `courseId`.
  - Has `status` (`upcoming|active|completed|cancelled`), and live fields like `livePlay`, `currentRound`.

- `tourCards`
  - Represents a member’s participation in a tour/season.
  - Links to Clerk via `clerkId` (not a Convex `members` id).
  - Links to `tourId` and `seasonId`.

- `teams`
  - A fantasy “entry” for a tournament.
  - Links: `tournamentId` + `tourCardId`.
  - Stores selected golfers as `golferIds: number[]` (these are **external API IDs**, not `golfers._id`).

- `golfers`
  - Master golfer identities keyed by `apiId`.

- `tournamentGolfers`
  - Join table: `golferId` (Convex Id of `golfers`) + `tournamentId`.
  - Stores tournament-specific performance and live-round data.

### Supporting entities

- `transactions`: ledger of account movements (amount in cents)
- `pushSubscriptions`: web push endpoints keyed to a member
- `auditLogs`: change tracking

---

## 3) Indexing conventions

The schema is heavily indexed for common access patterns.

Guidelines used in this repo:

- Prefer `.withIndex(...)` over `.filter(...)` where possible.
- Composite indexes exist for common lookups (examples):
  - `members.by_email`, `members.by_clerk_id`, `members.by_old_id`
  - `seasons.by_year_number`
  - `tours.by_season`, `tours.by_name_season`
  - `tourCards.by_member_season`, `tourCards.by_tour_season`
  - `teams.by_tournament_tour_card`
  - `tournamentGolfers.by_golfer_tournament`

Practical rule:

- If you’re adding a query that will be used frequently, add a schema index first, then use it.

---

## 4) CRUD pattern used in most modules

Most domain modules implement:

- `createXxx` (mutation)
- `getXxx` (query)
- `updateXxx` (mutation)
- `deleteXxx` (mutation)

Common shape:

- `args.data`: required values for the operation.
- `args.options`: optional “feature flags” for validation, response shaping, and behavior.

Common options:

- `skipValidation`: allow bulk/migration imports.
- `setActive`: default `true`.
- `returnEnhanced`: return computed fields + included related docs.
- `includeStatistics`: expensive extras; off by default.

### “Enhanced” responses

Each module has a local `enhanceXxx(ctx, doc, enhanceOptions)` helper near the bottom.

These helpers typically:

- Compute display fields (e.g. formatted dollars)
- Attach related docs (e.g. tournament → teams)
- Add computed stats and analytics

This keeps the main query/mutation handlers readable, and makes it easier to add/disable expensive work behind flags.

---

## 5) Money, timestamps, and deletes

### Money

- Money is stored as **cents** in integer numbers.
  - Examples: `members.account`, `tours.buyIn`, `tiers.payouts`, `tourCards.earnings`, `teams.earnings`.

### Timestamps

- Convex provides `_creationTime` automatically.
- This repo additionally uses `updatedAt` (number, ms since epoch) on most tables.

### Deletes

- This codebase does **hard deletes only** (no soft-delete flag in the schema).
- If a function has legacy `softDelete`/`setActive` options, treat them as deprecated/back-compat and prefer hard deletes.

### Duplicate function exports

**Convention: No duplicate function definitions across files**

- **`convex/functions/*.ts`** = domain modules with primary CRUD functions

**Do NOT duplicate function definitions across files.** When a function needs to move/rename, prefer a coordinated change (update the callers + docs) instead of leaving long-lived “shim” exports.

---

## 6) DataGolf integration

- `convex/functions/datagolf.ts` defines many **actions** that call DataGolf endpoints.
- Requires env var: `DATAGOLF_API_KEY`.
- Actions use a shared helper `fetchFromDataGolf()`.

Operational note:

- Actions are not cached like queries.
- Prefer calling DataGolf in actions, then optionally storing normalized data into Convex tables via mutations if you need caching/fast UI.

---

## 7) Frontend convenience queries

The frontend uses a small set of **server-owned convenience queries** for common screens. These are intentionally thin and index-friendly:

- `api.functions.seasons.getCurrentSeason`
- `api.functions.tournaments.getAllTournaments`
- `api.functions.tournaments.getTournamentWithDetails`
- `api.functions.teams.getSeasonStandings`
- `api.functions.teams.getTournamentTeams`
- `api.functions.tourCards.getTourCardsForClerk` / `api.functions.tourCards.getTourCardsForMember`
- `api.functions.golfers.getTournamentLeaderboardGolfers`

These are in addition to the generalized “getXxx with options + enhance” pattern used across many modules.

---

## 8) Where should “convenience” live (Convex vs hooks)?

In this repo, the performance tradeoff is mostly:

- **Convex convenience query**: fewer round trips, avoids client N+1, can use indexes consistently.
- **Hook convenience**: simpler backend surface area, but often requires multiple queries and/or client-side joining.

Important: **Indexes are only applied by the server-side query plan** (i.e. the Convex function). A hook can _benefit_ from indexes by calling indexed queries, but it cannot “use indexes itself”.

### Put it in Convex when

- You need data from **multiple tables** to render a single page/view model.
- The UI currently does **N+1** (query list → query each related doc).
- The access pattern is **hot** (leaderboard, tournament view, standings, home page)
- You want a single, consistent “definition” (e.g. what counts as current season).

### Keep it in hooks when

- It’s purely **presentation/derived UI** (grouping, formatting, sorting already-fetched data).
- It’s a one-off composition that isn’t reused.
- It would require many additional backend endpoints for little gain.

### Recommended split for PGC

**Convex convenience queries (recommended)**

- **Current season**: make server-owned.
  - Define “current” server-side (e.g. by date windows or by year+most recent season number) so it’s consistent and avoids client-side scanning.

- **Tournament details view model**: server-owned.
  - A single query like `getTournamentWithDetails({ tournamentId })` should fetch:
    - tournament (by id)
    - teams (by `teams.by_tournament`)
    - tournamentGolfers (by `tournamentGolfers.by_tournament`)
    - optionally course/tier (by id)
  - This avoids 3–5 separate `useQuery` calls and prevents UI-level joining.

- **Standings / leaderboard view models**: server-owned.
  - Example: `getSeasonStandings({ seasonId })` can use `tourCards.by_season_points` and return the ranking directly.
  - If you need “standings by tour”, add a dedicated query that uses `tourCards.by_tour_points`.

**Hook convenience (recommended)**

- Grouping/sorting for display (e.g. group standings by tour name, add badges, compute row colors).
- Combining “page state” (selected filters, UI tabs) with query arguments.

If you follow the above, you typically end up with **a small set of high-value server convenience endpoints**, and everything else stays as basic CRUD plus lightweight hooks.

---

## 9) Practical examples (how to get common data)

### Current season

Use the dedicated convenience query:

- `seasons.getCurrentSeason()`

### Tournament + teams + golfers

Use the dedicated convenience query:

- `tournaments.getTournamentWithDetails({ tournamentId })`

### A member’s tour cards

Use the convenience query used by the UI:

- `tourCards.getTourCardsForClerk({ clerkId, seasonId? })` (common in UI)
- `tourCards.getTourCardsForMember({ memberId, seasonId? })`

(Other entities generally use the generalized `getXxx` pattern.)
