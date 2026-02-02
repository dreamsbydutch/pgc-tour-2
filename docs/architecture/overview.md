# Architecture Overview

PGC is a full-stack web app built on:

- TanStack Start (React + Vite) for the frontend shell and server output
- TanStack Router for file-based routing
- Convex for database + backend functions
- Clerk for authentication
- PostHog for analytics

## Repo map (high-level)

- `src/` — frontend (routes, components, hooks, lib)
- `convex/` — backend (schema, functions, validators, utils, types)
- `public/` — static assets (PWA manifest, icons)
- `scripts/` — build/deploy helpers

## Generated code

This repo relies on generated artifacts that should not be edited by hand:

- `convex/_generated/*` (Convex API + data model typings)
- `src/routeTree.gen.ts` (TanStack Router route tree)

## Data flow (typical screen)

1. A route in `src/routes/*` validates URL state and renders one facilitator component.
2. A facilitator/widget or a hook in `src/hooks/*` calls Convex via `useQuery` / `useMutation`.
3. Convex functions (in `convex/functions/*`) query tables defined in `convex/schema.ts`.
4. UI primitives come from `src/components/ui/*` and are imported via `@/ui`.

## Conventions that matter most

- Keep route files thin; put view-model logic in hooks or facilitator/widget components.
- Keep the component taxonomy strict (UI vs displays vs widgets vs facilitators).
- In Convex, prefer basic CRUD per table and a small number of reusable “hot screen” convenience queries.

See also:

- [routing-and-rendering.md](routing-and-rendering.md)
- [data-model.md](data-model.md)
- [../frontend/component-taxonomy.md](../frontend/component-taxonomy.md)
- [../backend/convex-overview.md](../backend/convex-overview.md)
