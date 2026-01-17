# GitHub Copilot Instructions (PGC)

You are working in the **PGC** repo (Vite/React + Convex backend). Follow these instructions when generating or modifying code.

## General

- Prefer small, surgical changes.
- Don’t edit generated code in `convex/_generated/*`.
- Don’t edit generated code in `src/routeTree.gen.ts`.
- Keep TypeScript `strict` compatibility.
- Don’t introduce new libraries unless asked.

## Comments (Important)

- Do **not** add comments inside function bodies (no `// ...`, `/* ... */`, or JSX `{/* ... */}` within a function).
- If a function needs explanation, add a **single JSDoc header** immediately **above** the function.
- Prefer JSDoc that works with IntelliSense: include a short summary and (when helpful) `@param`, `@returns`, and an `@example`.
- Do not add block-by-block narration comments within a function.

## Frontend: How src/ works in this repo

This repo’s frontend is **TanStack Start** + **TanStack Router** (file-based routes), built with Vite.

Key rules:

- This is **not** a Next.js project.
- Routes live in `src/routes/*` and are defined with `createFileRoute(...)`.
- The global app shell/layout is `src/routes/__root.tsx`.
- The router is created in `src/router.tsx` using the generated `src/routeTree.gen.ts`.
- Prefer the `@/*` import alias (`@/components`, `@/hooks`, `@/lib/utils`).
- Use existing UI primitives in `src/components/ui/*` (shadcn/ui). Don’t invent new design tokens.
- Use `cn()` from `src/lib/utils.ts` for className composition.

Data & hooks:

- Prefer composing view models in hooks under `src/hooks/*`.
- For Convex reads, use `useQuery(api.functions.<module>.<query>, args | "skip")`.
- Keep route components thin: fetch/compose in hooks, render via components.

Auth & providers:

- Providers are wired in `src/components/Providers.tsx` (Convex + Clerk + PostHog).
- Preserve existing `"use client"` directives where present; don’t add them broadly unless required by the surrounding pattern.

## Convex: How it works in this repo

## Convex Direction (Important)

We prefer:

- **Convex functions = basic CRUD for each table** (create/get/update/delete).
- **A small set of Convex convenience queries** for hot screens (tournament view, leaderboard, standings) to reduce round trips and avoid client-side N+1.
- **React hooks = presentation/derived UI logic** (grouping, formatting, lightweight client-only composition).

Avoid adding lots of one-off server endpoints. If it’s not a reused, hot-path view model, keep it in hooks.

### File layout → API paths

Convex function modules map to `api` paths by file path:

- `convex/functions/seasons.ts` exports are referenced as `api.functions.seasons.<exportName>`
- `convex/functions/tournaments.ts` → `api.functions.tournaments.<exportName>`
- etc.

All app functions live under `convex/functions/*.ts` (there is no root-level `convex/functions.ts`).

### Function types

Use the correct server function type:

- `query` for reads only
- `mutation` for writes
- `action` for external APIs / non-deterministic work (e.g. `fetch`, third-party calls)

### Schema + validation

- Tables, validators, and indexes are defined in `convex/schema.ts`.
- Use `v` validators for all public function args.
- This codebase uses:
  - plural table names (e.g. `members`, `tournaments`)
  - `oldId?: string` on many tables for Supabase migration mapping
  - money amounts as **cents** (`number`)
  - `_creationTime` (built-in) + `updatedAt` (manual)

### Query performance

- Prefer `.withIndex("...")` when an index exists; avoid `.filter(...)` if it can be indexed.
- When adding a new frequently-used access pattern, update `convex/schema.ts` with a new index.
- Avoid unbounded `.collect()` on large tables unless necessary; prefer indexed reads + pagination.

### CRUD pattern (project convention)

Most domain modules follow a consistent “single CRUD function with options” shape:

- `createXxx` (mutation)
- `getXxx` (query)
- `updateXxx` (mutation)
- `deleteXxx` (mutation)

Conventions:

- `args.data` holds the core payload.
- `args.options` is optional and controls behavior, validation, response shaping.
- Common flags:
  - `skipValidation?: boolean`
  - `returnEnhanced?: boolean`
  - `includeStatistics?: boolean`

Keep these conventions when adding new entities/functions unless the user requests otherwise.

### “Enhanced” docs pattern

Most modules implement an internal helper:

- `async function enhanceXxx(ctx, doc, enhanceOptions)`

This helper:

- adds computed fields (formatted money, derived status)
- optionally includes related docs (season → tours, tournament → teams)
- optionally computes statistics

When asked for “more data in the response”, prefer either:

- Adding a small, reusable Convex convenience query for a hot screen, or
- Adding a hook that composes existing queries for presentation/derived UI.

### Migration helpers

For Supabase migration/import flows, follow the established patterns:

- Keep `oldId` mapping.
- Upsert by `oldId` (patch if exists, insert otherwise).
- Use `skipValidation` or dedicated `*WithMigration` helpers.

### External API actions (DataGolf)

- DataGolf integration is in `convex/functions/datagolf.ts`.
- It requires `DATAGOLF_API_KEY` in Convex env.
- Use `action` for fetch calls.

## Auth and identity (important)

Current Convex functions largely accept `clerkId` as an input and do not consistently enforce authorization.

- Do **not** introduce breaking auth changes without the user explicitly asking.
- If asked to “secure” endpoints, prefer using Convex auth patterns (`ctx.auth`) and derive the user identity server-side rather than trusting a client-provided `clerkId`.

## Testing / regen

- Do **not** run `npm run lint` or `npm run typecheck` after every small change.
  - Only run them when the user explicitly asks, or when finishing a larger/risky refactor where verification is important.
  - If unsure, ask whether to run checks instead of running them automatically.
- If you add/remove Convex exports, remind the user to regenerate types by running `npx convex dev`.
- Never hand-edit the generated `api` definitions.
