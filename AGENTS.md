# PGC Tour Agent Guide

PGC Tour is a season-long fantasy golf app for a friends-and-family community. Keep it fast, personal, and obvious without making it fragile as the league grows.

## Work standard

- Favor simple, direct systems. Measure twice, cut once; apply YAGNI and fight scope creep.
- Mobile web/PWA is the primary surface; desktop must remain complete and intentional.
- Treat oversized Convex subscriptions, unbounded reads, browser-side joins, expensive rendering, large bundles, and continuous animation as regressions.
- Protect the user's working tree, processes, configured services, and data. Existing changes belong to the user.

## Start from the source of truth

Inspect `git status --short` before editing and keep unrelated work out of scope.

- Read `docs/APP_ARCHITECTURE.md` for system and code placement decisions.
- Before changing league behavior, scoring, rosters, standings, payouts, or playoffs, read `docs/LEAGUE_AND_APP_GUIDE.md`.
- Read `docs/DEVELOPMENT_AND_OPERATIONS.md` for setup, deployment, migrations, repairs, and troubleshooting.
- `src/utils/rules.ts` records organizer-confirmed league intent shown in the app.
- Convex code, schema, and tests define behavior currently enforced; `package.json` defines commands.
- Use the matching project skill in `.agents/skills/` for specialized workflows.

If intent, documentation, and implementation disagree, surface the gap. Do not silently choose one; an intentional rule change updates the rulebook, implementation, tests, and maintained guide together.

## Architecture essentials

The normal flow is:

```text
route -> component -> hook -> typed Convex operation -> indexed data
                    -> UI-ready hook result -> component
```

Frontend dependency direction is `routes -> components -> hooks -> utils`; every layer may import `src/types/`, and reverse dependencies are not allowed.

- `src/routes/`: URL/search validation, minimal access gating, and page assembly.
- `src/components/`: rendering and local presentation state; no fetching or business/data transformation.
- `src/hooks/`: frontend data access, mutations, stateful workflows, and UI-ready view models.
- `src/utils/`: small reusable pure helpers; no fetching or rendering.
- `src/types/`: shared app-owned frontend types.
- Import components through `@/ui`, `@/displays`, `@/widgets`, and `@/facilitators`. Do not add new general logic to legacy `src/lib/` or new catch-all folders.

Convex placement:

- `convex/functions/`: domain queries, mutations, actions, and workflows.
- `convex/utils/`, `convex/types/`, `convex/validators/`: reusable helpers, integration types, and validators.
- `convex/schema.ts` and `convex/crons.ts`: persisted model, indexes, and recurring schedules.
- Queries read, mutations transact, and actions handle external/nondeterministic work. Scheduled and server-only operations are internal.

Never hand-edit `src/routeTree.gen.ts` or `convex/_generated/`.

## Universal guardrails

- Authenticate and authorize sensitive operations on the server from `ctx.auth`; never trust client-supplied identity or role.
- Use indexed, bounded reads and screen-oriented DTOs. Public responses expose display-safe fields only.
- Store money as integer cents and format it at the presentation boundary.
- Keep jobs bounded, idempotent, restartable, leased where concurrent, and auditable where sensitive.
- Keep secrets and member data out of source, logs, fixtures, artifacts, and docs. `VITE_` variables are browser-visible.
- Use a development Convex deployment for testing. Never import production exports or point experiments at live data.
- Do not deploy, repair/migrate production, or send real email/push messages unless explicitly requested.
- Reuse existing dev servers where appropriate. Track and stop only processes you start.
- Do not launch browser automation or computer control unless the user requests or approves it.
- Prefer inferred TypeScript types; do not introduce `any` to avoid modeling a boundary.
- Keep comments about why and usage, not line-by-line narration. Keep UI loading/error/success states truthful.

## Check every applicable surface

Before calling user-facing or league-affecting work complete, check and report what applied:

- mobile and desktop layouts;
- route, navigation, URL/search state, deep links, and notification links;
- signed-out/in, loading, empty, unavailable, forbidden, member, moderator, and admin states;
- registration, pre-tournament, live, completed, historical, regular-season, and playoff states;
- downstream standings, badges, leaderboards, notifications, and materialized views after canonical corrections;
- missing, stale, partial, duplicate, and failed integration data;
- the reverse path for reversible state and confirmation/audit for irreversible actions;
- maintained documentation when rules, architecture, operations, or commands change.

This is a completeness check, not permission for unrelated expansion.

## Verify proportionally

Use Node 22 and npm. Start with the smallest proof for the changed boundary:

- `npx vitest run <test-file>`
- `npx eslint <changed-files>`
- `npx prettier --check <changed-files>`
- `npm run typecheck` for TypeScript surface changes
- `npm run convex:io-check` for Convex read/write changes
- build and bundle checks for material routing, bundling, or frontend-performance changes

Backend behavior needs focused authentication, authorization, validation, idempotency, and downstream-state tests. League logic needs affected edge cases such as cuts, withdrawals, ties, awards, standings, and carryover. Prefer deterministic boundaries over sleeps or polling.

Run `npm run check` before release and after broad, infrastructure, or league-sensitive changes, not by default during a narrow iteration. Perform browser verification only when approved.

## Git and delivery

- Do not commit, push, deploy, or open a pull request unless explicitly asked.
- Preserve unrelated staged, unstaged, and untracked changes.
- Keep one concern per change and use conventional, plain-language commit titles.
- Rebase onto current main before opening a requested PR.
- UI changes need mobile and desktop before/after evidence; motion or timing changes need a short recording.
- When babysitting a PR, assess checks and comments against the latest commit, fix verified issues, explain false positives, and do not merge without authorization.
