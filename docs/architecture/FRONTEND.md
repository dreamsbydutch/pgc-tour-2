# Frontend Architecture

Use this page for routes, search state, providers, hooks, components, responsive behavior, and browser performance. `AGENTS.md`, `eslint.config.js`, `tsconfig.json`, and the source tree enforce the placement rules summarized here.

## Stack and application shell

TanStack Start and Router provide file-based routing and SSR, React renders the interface, Vite builds it, Nitro emits the server artifact, Tailwind supplies styling, and Clerk/Convex providers supply identity and live data.

`src/routes/__root.tsx` owns the document shell:

```text
RootDocument
  -> Providers
     -> ClerkProvider
     -> ConvexProviderWithClerk
     -> ViewerBootstrapProvider
  -> NavigationContainer
  -> route content
  -> signed-out prompt
  -> development-only lazy tools
```

`Providers` renders a diagnostic state when required browser configuration is missing. `ViewerBootstrapProvider` provisions an authenticated member once per Clerk subject and subscribes to the small private viewer bootstrap. This provider integration lives in `src/convex/`; it is not permission for ordinary components to call Convex directly.

## Dependency and ownership direction

```text
routes -> facilitators/displays/widgets/ui -> hooks -> utils
    \-------------- all layers may import types --------------/
```

| Layer                          | Owns                                                                                                             | Must not own                                                               |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/routes/`                  | Route declarations, meta, parameter/search validation, canonical URL updates, minimal page-level access wrappers | Direct Convex reads/writes, reusable business calculations, large UI trees |
| `src/components/facilitators/` | Page-level composition                                                                                           | Data fetching and reusable domain transforms                               |
| `src/components/displays/`     | Domain presentation sections                                                                                     | Server authority and canonical calculations                                |
| `src/components/widgets/`      | Focused interactive pieces and access wrappers                                                                   | Cross-screen data orchestration                                            |
| `src/components/ui/`           | Reusable primitives/composites                                                                                   | Hooks, routing, auth, Convex, or domain knowledge                          |
| `src/hooks/`                   | Convex calls, mutations, asynchronous workflows, shared UI state, grouping/sorting, discriminated view models    | Markup-heavy page composition                                              |
| `src/utils/`                   | Focused reusable pure calculations/formatting                                                                    | Fetching, hooks, or rendering                                              |
| `src/types/`                   | App-owned shapes shared across files                                                                             | Provider/generated shapes TypeScript can infer                             |

Import components through `@/ui`, `@/displays`, `@/widgets`, and `@/facilitators`. Use `@/hooks` and `@/convex` for their public barrels. Do not deep-import through `@/components/...`, add to the legacy `@/lib` barrel, or make a utility depend on a hook/component. ESLint blocks the most important reverse dependencies.

## Route and URL behavior

The current route catalog and access states are in [surfaces and states](../product/SURFACES_AND_STATES.md).

- `/standings` validates optional `season` and `tour` search values and removes unknown keys. Selection changes replace the URL so deep links remain shareable.
- `/tournament` validates `tournamentId`, `tourId`, and `variant`. The page canonicalizes the chosen event and competition; regular tours become Gold/Silver bracket IDs for playoffs.
- `/account` uses a signed-in hard gate. `/admin` uses a signed-in plus resolved-admin hard gate. These improve rendering and navigation but never replace server authorization.
- Notification and scorecard links must resolve to valid route/search state. Keep defaults deterministic for signed-out viewers and stale selections.
- `src/routeTree.gen.ts` is generated. Add/change a route source file, then let TanStack tooling regenerate the tree; never patch the generated tree directly.

## Screen data and subscriptions

Design the public Convex DTO and hook result together.

1. Subscribe to the smallest stable shell or screen read model.
2. Keep viewer-private context in the viewer bootstrap or an authenticated screen query, not a viewer-dependent public query.
3. Return explicit display-safe fields; do not spread database documents at a public boundary.
4. Derive one UI-ready model in a hook or pure utility instead of joining arrays repeatedly during render.
5. Load large/expanded details only when opened. Standings history, team details, and hole scorecards follow this pattern.
6. Keep mutation state explicit and reset stale errors when a new attempt starts.

Avoid a subscription per row, browser-side N+1 joins, broad bootstrap payloads, and continuously changing objects that retrigger expensive rendering. Use [backend read-model rules](BACKEND.md#bounded-reads-and-dtos) for the server side.

## Truthful UI states

Every data-backed surface should distinguish the applicable states rather than using absence as a catch-all:

- auth/provider loading;
- signed out, missing member, inactive member, forbidden role;
- query loading, empty, unavailable, partial, stale/reconnecting, and error;
- mutation idle, confirming, busy, success/skipped, and failure;
- no season, registration, in season, completed;
- upcoming before picks, picks open, picks closed, active/live, between rounds, completion held, completed, cancelled;
- regular tour, Gold, Silver, and not qualified;
- own pre-start roster versus intentionally private competitors.

Cached `appState` drives efficient display choices. Exact mutation and privacy decisions are revalidated on the server with current time; never promote a cached display phase into client authority.

## Mobile, desktop, and accessibility

- Mobile/PWA is the primary surface; desktop must expose the same essential information and actions without accidental whitespace or hidden columns.
- Prefer responsive layout changes over separate mobile and desktop business logic.
- Preserve semantic controls, keyboard focus, readable labels, status announcements, and reduced-motion behavior.
- Tables and leaderboards may scroll horizontally when the data relationship requires it; keep identity and current-score context visible.
- Avoid continuous animation. Centering/jump behavior must respect `prefers-reduced-motion`.
- User-visible times require a named timezone/source. User-visible money is formatted only after integer-cent calculations.

UI changes need both mobile and desktop inspection before a requested PR. Browser automation or computer control requires user request or approval.

## PWA and analytics

`public/manifest.json` makes the site installable and exposes tournament/standings shortcuts. `public/sw.js` handles push notification display and click navigation only; it does not cache an offline shell. See [known gaps](../KNOWN_GAPS.md#the-pwa-is-not-offline-first).

PostHog is optional. `src/hooks/useAnalytics.ts` sends allowlisted coarse route/event properties and drops automatic URL-rich events. Keep member identity, roster contents, balances, provider payloads, and raw errors out of analytics. PostHog must remain outside the initial bundle graph.

## Legacy hotspots

The target architecture is newer than parts of the codebase:

- `src/lib/` remains for legacy article content; do not add general utilities or types there.
- Some large facilitator/display files still contain local transformations that would belong in hooks/utilities if touched substantially.
- Some deep `@/components/...` imports predate the barrels.
- `src/types/app.ts` still aggregates older cross-domain shapes.

Do not refactor these merely to make the tree prettier. New code follows the current boundary; a scoped change may move the touched responsibility when tests make that safe. Track broader cleanup separately in [known gaps](../KNOWN_GAPS.md#architectural-migration-is-incomplete).

## Verification

- Pure model change: focused `src/utils/*.test.ts`.
- Hook workflow: focused hook test with controlled Convex/auth inputs.
- Render state: Testing Library test for user-visible behavior, not component internals.
- Route/search change: validate invalid, absent, stale, and canonical values plus deep links.
- Material routing/bundle change: typecheck, build, bundle analysis, and budgets.
- User-facing PR: mobile and desktop evidence; a short recording for motion/timing.

Related: [surfaces](../product/SURFACES_AND_STATES.md), [backend](BACKEND.md), [code map](../reference/CODE_MAP.md), and the `$pgc-frontend-flows` skill.
