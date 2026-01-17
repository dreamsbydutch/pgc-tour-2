# src/ (Frontend)

This folder contains the TanStack Start + TanStack Router frontend.

If you’re new to the repo, start here:

- `router.tsx` — creates the router
- `routes/__root.tsx` — global app shell (providers/nav/PWA)
- `routes/` — file-based routes
- `components/` — reusable UI + domain components
- `hooks/` — data fetching + lightweight view model hooks

## High-level layout

```
src/
  components/
  data/
  hooks/
  lib/
  routes/
  router.tsx
  routeTree.gen.ts   (generated)
  styles.css
```

## Key conventions

- Routing is TanStack Router file-based routing under `routes/`.
- Prefer the `@/*` alias (`@/components`, `@/hooks`, `@/lib/utils`).
- UI primitives (shadcn/ui) live in `components/ui/`.
- Use `cn()` from `lib/utils.ts` for className merging.
- Do not edit generated files like `routeTree.gen.ts`.

## Where to add things

- New page/route: add a file under `routes/`.
- New reusable component: add to `components/` and export from `components/index.ts` if it’s shared.
- New view-model/data composition: add a hook under `hooks/`.
- Shared utilities: add to `lib/`.
- Static, local-only data: add to `data/`.

For more detail, see `docs/frontend.md`.
