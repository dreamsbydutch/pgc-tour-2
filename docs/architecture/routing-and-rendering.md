# Routing and Rendering

This repo uses TanStack Start + TanStack Router (file-based routes).

## Files that define routing

- `src/routes/*` — route modules (file-based)
- `src/routes/__root.tsx` — app shell (HTML document + Providers)
- `src/router.tsx` — router creation
- `src/routeTree.gen.ts` — generated route tree

## Root shell responsibilities

The root route shell is the “document” wrapper. In this repo it:

- Defines `<head>` metadata (app title, PWA and SEO-ish tags)
- Mounts the provider stack (Clerk + Convex + PostHog)
- Renders global navigation and persistent UI
- Registers the service worker in production, and proactively unregisters in development

If you’re adding global providers or shell-wide UI, prefer doing it in the root shell rather than scattering it across routes.

## Route file conventions

Routes in `src/routes/*` should be thin “middleware”:

- URL validation (`validateSearch` / reading params + search)
- lightweight gating (signed-in / role checks) when needed
- navigation wiring (`useNavigate`) to keep URL state in sync
- render exactly one page component from `@/facilitators`

Avoid in route files:

- Convex `useQuery` / `useMutation`
- business logic and view-model construction
- complex UI composition

## Navigation

Use TanStack Router’s `Link` for SPA navigation.

## Service worker / PWA

The shell handles service worker registration. Development mode unregisters existing registrations to avoid stale caching problems.

See also:

- [../frontend/routing-conventions.md](../frontend/routing-conventions.md)
- [../deployment/vercel.md](../deployment/vercel.md)
- [../operations/troubleshooting.md](../operations/troubleshooting.md)
