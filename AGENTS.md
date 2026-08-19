# PGC Tour Agent Guide

PGC Tour is a private, season-long fantasy golf PWA for a friends-and-family league. Optimize for a fast, obvious mobile experience, complete desktop behavior, correct league outcomes, and safe operator workflows. Prefer the smallest direct change that preserves those qualities.

## Start here

1. Run `git status --short`. Existing changes belong to the user; keep unrelated work out of scope.
2. Open the [documentation wiki](docs/README.md) and read the pages for the affected domain. Use [the code map](docs/reference/CODE_MAP.md) when you do not know where a behavior lives.
3. Load the matching project skill from `.agents/skills/` when its description matches the task. Skill descriptions define their boundaries; use multiple skills when a change crosses domains.
4. Confirm intent against the right source of truth:

| Question                                    | Authority                                                                  |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| What the league intends                     | Organizer-confirmed `src/utils/rules.ts`                                   |
| What the app enforces now                   | Convex implementation, schema, and tests                                   |
| What is persisted and indexed               | `convex/schema.ts`                                                         |
| What runs automatically                     | `convex/crons.ts` plus exact schedules in `convex/functions/readModels.ts` |
| Where code belongs                          | This file and [architecture docs](docs/APP_ARCHITECTURE.md)                |
| What commands exist                         | `package.json`                                                             |
| What is known to disagree or remain unwired | [Known gaps](docs/KNOWN_GAPS.md)                                           |

If intent, docs, and implementation disagree, surface the gap. Do not silently choose one. An intentional league-rule change updates the in-app rulebook, backend behavior, tests, and domain wiki together.

## Commands

Use Node 22 (`.nvmrc` pins 22.23.1) and npm. `package.json` is authoritative; the complete catalog and prerequisites are in [commands](docs/reference/COMMANDS.md).

| Need                                      | Command                                           |
| ----------------------------------------- | ------------------------------------------------- |
| Clean install                             | `npm ci`                                          |
| Configure a development Convex deployment | `npx convex dev --configure`                      |
| Frontend dev server on port 3000          | `npm run dev`                                     |
| Convex dev/code generation                | `npm run convex:dev`                              |
| Focused test                              | `npx vitest run <test-file>`                      |
| Changed-file lint                         | `npx eslint <changed-files>`                      |
| Changed-file format check                 | `npx prettier --check <changed-files>`            |
| TypeScript boundary check                 | `npm run typecheck`                               |
| Convex public-I/O guard                   | `npm run convex:io-check`                         |
| Docs, links, and skill metadata           | `npm run docs:check`                              |
| Production build                          | `npm run build`                                   |
| Bundle report/budgets after build         | `npm run bundle:analyze && npm run bundle:budget` |
| Full local quality gate                   | `npm run check`                                   |

`npm run dev` binds with `--host`; use it only on a trusted network. `npm run convex:deploy`, production `npx convex run --prod ...`, Vercel deployment, live repairs, and real email/push sends require explicit authorization.

## Repository and deployment map

| Path                                     | Responsibility and rule                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/routes/`                            | TanStack file routes, validated URL/search state, minimal access gates, page assembly                         |
| `src/components/`                        | Rendering and local presentation state; import through `@/ui`, `@/displays`, `@/widgets`, or `@/facilitators` |
| `src/hooks/`                             | Frontend reads/writes, async workflows, shared state, and UI-ready view models                                |
| `src/utils/`                             | Small reusable pure helpers; no fetching or rendering                                                         |
| `src/types/`                             | Shared app-owned frontend types                                                                               |
| `src/convex/`                            | Typed Convex client exports and provider/bootstrap integration                                                |
| `src/lib/`                               | Legacy-only area; do not add new general logic here                                                           |
| `convex/functions/`                      | Public/internal queries, mutations, actions, and workflows by domain                                          |
| `convex/utils/`, `types/`, `validators/` | Reusable backend logic, integration types, and boundary validation                                            |
| `convex/schema.ts`, `convex/crons.ts`    | Persisted model/indexes and recurring schedules                                                               |
| `public/`                                | Static and PWA assets; `sw.js` handles push, not offline asset caching                                        |
| `email-templates/`                       | Human-maintained Brevo template sources; not runtime-loaded app pages                                         |
| `scripts/`                               | Quality, bundle, documentation, and deployment helpers                                                        |
| `docs/`                                  | Maintained product, domain, architecture, operations, and reference wiki                                      |
| `.agents/skills/`                        | Project-specific task routing and non-obvious workflow invariants                                             |
| `.github/`                               | CI, security scanning, dependency updates, and tool pointers                                                  |

`npm run build` produces ignored Nitro output in `.output/` and Vercel Build Output in `.vercel/output/` when available. The frontend/SSR artifact deploys to Vercel; `convex/` deploys separately to Convex. See [deployment](docs/operations/DEPLOYMENT.md) before changing either path.

Never hand-edit generated `src/routeTree.gen.ts` or `convex/_generated/`. Regenerate them with the owning TanStack or Convex tooling and review generated diffs. Other generated/ignored paths include `.tanstack/`, `.nitro/`, `.output/`, `.vercel/`, `artifacts/`, and `node_modules/`.

## Architecture rules

The normal frontend flow is:

```text
route -> page/facilitator -> component -> hook -> typed Convex operation
                                      <- UI-ready view model <- indexed data
```

- Dependency direction is `routes -> components -> hooks -> utils`; all layers may import `src/types/`. Reverse dependencies are not allowed.
- Routes own URL validation and assembly, not Convex calls or business calculations. `src/routes/__root.tsx` is the framework shell exception.
- Components render. They may call app hooks, but do not fetch directly or own reusable business/data transforms.
- Hooks own Convex calls, mutations, stateful workflows, sorting/grouping, and explicit loading/error/empty models.
- Utilities remain focused and preferably pure. App-owned cross-file shapes live in `src/types/`; prefer inference for local/provider-generated shapes.
- Queries read; mutations transact; actions perform external or nondeterministic work. Scheduled/server-only implementations are internal.
- Design the screen DTO and hook together: return only what the screen needs, avoid browser joins/N+1 calls, and load large details on demand.

The detailed boundaries, exceptions, and legacy hotspots are in [frontend architecture](docs/architecture/FRONTEND.md) and [backend architecture](docs/architecture/BACKEND.md).

## Universal invariants

- Authenticate and authorize sensitive work on the server from `ctx.auth`; never trust client-supplied identity, ownership, or role.
- Use indexed, bounded reads and explicit public/viewer/admin DTOs. Public data contains display-safe fields only.
- Store money as safe integer cents. Keep golf strokes, relative-to-par values, positions, points, and money explicitly distinct.
- Keep jobs bounded, idempotent, restartable, leased when concurrent, and audited when sensitive.
- A correction to canonical tournament data must refresh affected teams, awards, standings, badges/read models, notifications, and `appState` in dependency order.
- Keep secrets, member data, live payloads, and production exports out of source, logs, fixtures, screenshots, artifacts, and docs. Every `VITE_` value is browser-visible.
- Test against a development Convex deployment. Never point experiments at live data.
- Prefer inferred TypeScript types; do not introduce `any` to avoid modeling a boundary.
- Treat oversized subscriptions, unbounded reads, browser-side joins, expensive rendering, large bundles, and continuous animation as regressions.
- Loading, empty, stale, unavailable, forbidden, success, and failure UI must remain truthful. Respect reduced motion.

## Navigate quickly

Start with `rg` rather than browsing folders manually:

```powershell
rg --files src convex docs .agents
rg -n "api\.functions" src/hooks
rg -n "^export const" convex/functions
rg -n "defineTable|\.index\(" convex/schema.ts
rg -n "crons\.|scheduler\." convex
rg -n "describe\(|it\(" src convex -g "*.test.ts" -g "*.test.tsx"
```

Trace a feature both directions: route/component -> hook -> public Convex operation -> schema/index, then tests -> downstream materialized state. Search exact user-visible copy to find the owning surface. Existing legacy placement is evidence of history, not a pattern to copy.

## Verify proportionally

Start with the narrowest proof for the changed boundary, then widen for risk.

- Pure logic: focused Vitest file and formatting/lint for changed files.
- Frontend state or TypeScript surfaces: focused tests, lint, formatting, and `npm run typecheck`.
- Convex reads/writes: focused auth/validation/idempotency tests plus `npm run convex:io-check`.
- Routing, build, or bundle changes: `npm run build`; analyze and budget material bundle changes.
- Documentation/skills: `npm run docs:check` and Prettier.
- Broad, release, infrastructure, financial, security, or league-sensitive work: `npm run check`.

League logic needs the applicable cuts, WD/DQ, ties, points/payouts, standings, and playoff carryover cases. Backend writes need authentication, authorization, validation, idempotency, and downstream-state proof. Do not use display output alone as proof of persisted correctness.

For user-facing work, check every applicable mobile/desktop, signed-out/in, loading/empty/error/forbidden, URL/deep-link, tournament-phase, regular/playoff, partial/stale integration, and reverse/confirmation state. Browser automation requires user request or approval; UI changes need mobile and desktop evidence when preparing a PR.

## Documentation and delivery

- Keep one canonical wiki page per durable fact; hubs and skills link to it rather than copying volatile catalogs.
- Update the wiki when a command, environment owner, route, state machine, schema responsibility, integration, runbook, or league invariant changes.
- Record unresolved contradictions in `docs/KNOWN_GAPS.md` with source paths. Remove the entry when the same change resolves it.
- Do not commit, push, deploy, open a PR, merge, repair production, or contact members unless explicitly requested.
- Use `$create-pgc-preview-pr` when the user explicitly asks to execute delivery of the completed current goal as a GitHub PR with a verified Vercel preview. The delivery request—not merely selecting the skill—authorizes scoped branch/commit/push/PR work, never merge or production deployment.
- Use `$maintain-pgc-pr` for an already-existing PR's current-SHA checks, review feedback, copy, or explicitly requested follow-up fixes. Inspection or monitoring does not authorize PR mutations.
- Preserve unrelated staged, unstaged, and untracked work. Stage explicit paths; never use `git add .` in a dirty tree.
- Keep one concern per change and use conventional, plain-language commit titles.
- Before a requested PR, fetch current `origin/main`; rebase only a clean unpublished scoped branch, rerun affected checks, and report evidence honestly. Never rewrite a published branch, force-push, or merge without authorization.
