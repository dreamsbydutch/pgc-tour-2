# Frontend Data and State

This repo uses Convex for backend reads/writes and keeps most view-model logic in hooks.

## Convex hooks

From `src/convex/index.ts` you can import:

- `api` (typed Convex API)
- `useQuery`, `useMutation`, `useAction`, `usePaginatedQuery`

Typical pattern:

- reads: `useQuery(api.functions.<module>.<query>, args | "skip")`
- writes: `const mutate = useMutation(api.functions.<module>.<mutation>)`

## Where to put view models

Prefer:

- reusable derived state in `src/hooks/*`
- orchestration in a facilitator component
- small, leaf flows inside widgets

Avoid:

- building view models directly inside route files

## URL state

TanStack Router is the source of truth for params/search. Keep URL syncing in route files or facilitator-level glue.

## Derived UI state

Examples of derived UI state:

- grouping, sorting, formatting
- computed labels and status

Prefer keeping this logic in hooks so components stay mostly declarative.

See also:

- [component-taxonomy.md](component-taxonomy.md)
- [../backend/convex-overview.md](../backend/convex-overview.md)
