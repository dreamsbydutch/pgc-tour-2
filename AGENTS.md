# Project Guardrails

Before changing league behavior, scoring, rosters, standings, or playoffs, read `docs/LEAGUE_AND_APP_GUIDE.md`.

These rules apply to all frontend code in `src/`.

## Frontend structure

Keep frontend code within these clear boundaries:

- `src/components/`: UI rendering only. Components may compose other components and call hooks, but must not fetch data or contain data-transformation/business logic.
- `src/hooks/`: all data fetching, stateful data handling, mutations, and business/data manipulation. Hooks provide components with UI-ready data and actions.
- `src/utils/`: small, reusable, preferably pure helper functions. Use helpers to keep hooks focused and readable; helpers must not render UI or fetch data.
- `src/types/`: the single home for all app-owned TypeScript types and interfaces. Do not declare app types inside components, hooks, or utility files.

## Dependency direction

Follow this dependency flow:

`components -> hooks -> utils`

Types may be imported by every layer. Utilities must not import from hooks or components, and hooks must not import from components.

## Working rules

- Before adding code, place it according to its responsibility rather than convenience.
- Keep route files thin: they should assemble page components, not contain fetching or business logic.
- Extract non-trivial component logic into a hook.
- Extract focused, reusable calculations or transformations from hooks into `src/utils/`.
- Add or update shared types in `src/types/`; avoid duplicate, inline, or locally redefined app types.
- Do not create alternate catch-all folders such as `helpers`, `services`, or additional `lib` modules for frontend logic.
- Framework-generated files and framework-required route declarations are exceptions, but app-owned code used by them must still follow these boundaries.
- When modifying existing code that violates these rules, avoid adding new violations and move touched logic toward the correct folder when reasonably scoped.
