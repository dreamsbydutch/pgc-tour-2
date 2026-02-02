# Component Taxonomy and Import Rules

This repo uses a strict component taxonomy. The goal is to make intent obvious and prevent business logic from leaking into UI primitives.

## The four buckets

### `src/components/ui/*` (import from `@/ui`)

UI primitives/composites only (shadcn/ui-style).

Allowed:

- prop-driven rendering
- local UI state + DOM effects for presentation (focus, outside click, measuring, etc.)
- composing other UI primitives

Not allowed:

- Convex hooks (`useQuery`, `useMutation`, `useAction`)
- auth/role hooks
- router reads/writes
- business logic / app orchestration

### `src/components/displays/*` (import from `@/displays`)

Presentational components: props in, UI out.

- Avoid data fetching
- Avoid routing concerns

### `src/components/widgets/*` (import from `@/widgets`)

Leaf components that may own local state and small data flows.

- Can use Convex hooks and app hooks when appropriate
- Should remain self-contained

### `src/components/facilitators/*` (import from `@/facilitators`)

Orchestration components and page-level composition.

- Compose displays/widgets
- Handle routing glue and feature-level state

## Import rules (important)

Component imports must come only from:

- `@/ui`
- `@/displays`
- `@/widgets`
- `@/facilitators`

Avoid:

- importing from `@/components`
- deep imports like `@/components/widgets/...`

If a component isn’t exported yet, add it to the correct barrel file:

- `src/components/ui/index.ts`
- `src/components/displays/index.ts`
- `src/components/widgets/index.ts`
- `src/components/facilitators/index.ts`

## One component per file

Project convention:

- Each `.tsx` file exports exactly one React component.
- Optional internals can live in the same file:
  - an unexported hook (view-model)
  - an unexported Skeleton component

## Comments / documentation style

- Do not add comments inside function bodies.
- If a function needs explanation, use a single JSDoc header immediately above it.
- Exported components should have an in-depth JSDoc header that explains render states and data sources.

See also:

- [routing-conventions.md](routing-conventions.md)
- [data-and-state.md](data-and-state.md)
