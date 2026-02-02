# Frontend Routing Conventions

Routes live in `src/routes/*` and are file-based.

## Route file responsibilities

Route files should be thin. Prefer:

- validate and parse URL state (params/search)
- minimal gating (signed-in / role checks) when needed
- URL syncing via `useNavigate`
- render a single page component from `@/facilitators`

Avoid in route files:

- Convex hooks
- business logic
- complex UI composition

## Root route shell

The shell is in `src/routes/__root.tsx` and is responsible for:

- document head metadata
- mounting app providers
- global navigation
- PWA service worker handling

## Link usage

Use `Link` from `@tanstack/react-router` for client navigation.

## Generated route tree

`src/routeTree.gen.ts` is generated.

- Do not edit it by hand.
- If routes feel out of sync, re-run the router tooling (usually happens during dev).

See also:

- [../architecture/routing-and-rendering.md](../architecture/routing-and-rendering.md)
- [../operations/troubleshooting.md](../operations/troubleshooting.md)
