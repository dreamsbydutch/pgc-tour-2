# Frontend (src/) Guide

This repo’s frontend lives in `src/` and is built on **TanStack Start** + **TanStack Router** (file-based routes) with **Convex** for backend data, **Clerk** for auth, and **Tailwind + shadcn/ui** for UI.

> Note: This is not a Next.js project. You may see some `"use client"` directives—keep existing patterns, but routing/layout is TanStack Router.

## How the app boots

- `src/router.tsx`
  - Creates the TanStack Router instance from the generated route tree.
- `src/routeTree.gen.ts`
  - **Generated** by TanStack Router. Do not edit.
- `src/routes/__root.tsx`
  - The root route/layout.
  - Defines document `<html>`, `<head>` meta/link tags, wraps the app in providers, renders the navigation, and registers the service worker.
  - Renders route content via `{children}`.

## Routing

Routes are file-based under `src/routes/`.

Current routes:

- `src/routes/index.tsx` (`/`) — home page / demo / migrated components showcase.
- `src/routes/tournament.tsx` (`/tournament`) — tournament screen wrapper (renders `TournamentView`).
- `src/routes/standings.tsx` (`/standings`) — standings screen.
- `src/routes/history.tsx` (`/history`) — tournament history / header demo.
- `src/routes/rulebook.tsx` (`/rulebook`) — rulebook page using data in `src/data/rules.ts`.

Conventions:

- Each route exports `Route = createFileRoute("/path")({ component: ... })`.
- Prefer using Convex `useQuery` with `"skip"` for conditional fetching.
- The root layout (`__root.tsx`) owns global UI shell concerns (nav, providers, PWA).

## Folder map: src/

### `src/components/`

Reusable UI and domain components.

Key conventions:

- Prefer importing shared components from `src/components/index.ts` when it’s already exported.
- shadcn/ui primitives live in `src/components/ui/` (`Button`, `Card`, `Skeleton`, `Table`, etc.).

Notable areas:

- `src/components/navigation/`
  - Responsive top/bottom navigation integrated with TanStack Router + Clerk.
  - Has its own mini-README at `src/components/navigation/README.md`.
- `src/components/leaderboard/`
  - Leaderboard view components and utilities.
  - Re-exports related hooks from `src/hooks/` for convenience.
- `src/components/pre-tournament/`
  - Pre-tournament UI (picks/forms) with local utils/types.
- `src/components/HomePageListings/`
  - Home page listings and related business logic.

### `src/hooks/`

React hooks that compose data and lightweight view-model logic.

Common patterns:

- Convex reads via `useQuery(api.functions.<module>.<fn>, args | "skip")`.
- Use `useMemo` for derived results (sorting/grouping) to avoid recompute churn.

Hooks present:

- `useLeaderboardData.ts`, `useLeaderboardLogic.ts`
- `useNavigationData.ts`
- `usePreTournamentData.ts`
- `useStandingsData.ts`

### `src/lib/`

Shared utilities.

- `src/lib/utils.ts` exports `cn()` (Tailwind class merging) and formatting helpers.

### `src/data/`

Static data used by routes/components.

- `src/data/rules.ts` powers `/rulebook`.

### `src/styles.css`

Tailwind layers + CSS variables (design tokens). Avoid hardcoding new colors in components; prefer tokens/classes.

## Data layer: Convex + Clerk

- Providers are wired in `src/components/Providers.tsx`:
  - `ConvexReactClient` uses `import.meta.env.VITE_CONVEX_URL`
  - `ClerkProvider` uses `import.meta.env.VITE_CLERK_PUBLISHABLE_KEY`
  - `ConvexProviderWithClerk` integrates the two.

### Calling Convex from the client

- Client queries use `convex/react`:
  - `useQuery(api.functions.<module>.<queryName>, args)`
- API types are generated under `convex/_generated/*` and imported via `convex/_generated/api`.
- Prefer strong types from `convex/_generated/dataModel` (`Id<"table">`) when passing ids.

## Import aliases

`tsconfig.json` defines:

- `@/*` → `src/*`

So prefer:

- `import { TournamentView } from "@/components"`
- `import { cn } from "@/lib/utils"`

## Generated files (do not edit)

- `src/routeTree.gen.ts`
- `convex/_generated/*`

If route exports or Convex exports change, regenerate the relevant artifacts (TanStack Router and Convex dev tooling).
