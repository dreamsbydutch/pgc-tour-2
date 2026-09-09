---
name: pgc-frontend-flows
description: Build, diagnose, test, or refactor PGC mobile PWA and desktop flows across TanStack routes, search state, components, hooks, navigation, deep links, screen DTOs, responsive states, and UI evidence. Use for frontend work; server rules and data boundaries use their owning skills.
metadata:
  short-description: Build responsive PGC frontend flows
---

# PGC frontend flows

Read the [frontend architecture](../../../docs/architecture/FRONTEND.md), [product surfaces and states](../../../docs/product/SURFACES_AND_STATES.md), and [quality guide](../../../docs/operations/QUALITY_AND_TESTING.md).

## Scope and handoffs

Own URL/search behavior, page assembly, UI composition, frontend data workflows, responsive presentation, interaction state, navigation/deep links, accessibility, and truthful loading/error/success feedback.

- Use `$pgc-convex-boundaries` for query/mutation design, authorization, DTO privacy, subscriptions, or I/O budgets.
- Use the relevant domain skill whenever a change affects league, scoring, roster, financial, standings, lifecycle, or messaging behavior.

## Preserve frontend boundaries

Follow `route -> component -> hook -> typed Convex operation -> indexed data`.

- Routes validate URL/search state, apply minimal access gating, and assemble pages.
- Components render and own only local presentation state; they do not fetch or perform business/data transformation.
- Hooks own Convex calls, mutations, stateful workflows, sorting/grouping, and UI-ready view models.
- Pure reusable calculations belong in `src/utils/` and shared app-owned shapes in `src/types/`.
- Import components through the maintained barrels and do not hand-edit generated route or Convex files.
- Treat mobile web/PWA as primary while keeping desktop complete. Check signed-out/in, loading, empty, unavailable, forbidden, success, and failure states that apply.
- Keep URL state, deep links, notification links, keyboard/focus behavior, reduced motion, and stale/partial data truthful.
- Do not start browser automation unless the user requests or approves it.

## Trace and verify

Trace `src/routes/` to `src/components/`, `src/hooks/`, `src/utils/` and `src/types/`, then through the typed Convex boundary. Watch for browser joins, oversized subscriptions, expensive rerenders, eager optional bundles, and continuous animation.

Test pure transformations at utility boundaries, stateful orchestration at hook boundaries, and stable user-visible component behavior. Run focused Vitest, ESLint, Prettier, and typecheck; add build and bundle checks for route, dependency, or performance changes. When approved, collect mobile and desktop evidence and a recording for motion/timing.
