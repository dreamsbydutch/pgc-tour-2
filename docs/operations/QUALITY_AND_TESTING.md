# Quality and testing

> Purpose: prove a change at the smallest useful boundary, then run broader
> gates in proportion to its risk. Sources of truth are
> [`package.json`](../../package.json), [`vite.config.ts`](../../vite.config.ts),
> [`tsconfig.json`](../../tsconfig.json),
> [`eslint.config.js`](../../eslint.config.js), the scripts under
> [`scripts/`](../../scripts), and [GitHub workflows](../../.github/workflows).
> Return to the [wiki index](../README.md).

## Verification strategy

Start narrow. Expand when a change crosses boundaries, affects league results,
changes infrastructure, or is being released.

| Changed boundary                                         | Minimum useful proof                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Markdown or project skill                                | `npm run docs:check` plus `npx prettier --check <files>`                                      |
| Pure utility or league calculation                       | Focused Vitest file, ESLint, and Prettier                                                     |
| Component or hook                                        | Focused test; signed-out/in, loading, empty, error, and authorized states as applicable       |
| Convex read                                              | Focused backend test, authentication/privacy cases, and `npm run convex:io-check`             |
| Convex write/job                                         | Authentication, authorization, validation, idempotency, retry/downstream tests, and I/O check |
| Route, build, or bundle behavior                         | Typecheck, build, bundle analysis, and budgets                                                |
| Broad, infrastructure, release, or league-sensitive work | `npm run check` plus applicable security and manual checks                                    |

Focused commands:

```powershell
npx vitest run path/to/file.test.ts
npx eslint path/to/changed-file.ts
npx prettier --check path/to/changed-file.ts
npm run docs:check
npm run typecheck
npm run convex:io-check
```

`npm run lint:fix` and `npm run format` modify files. Inspect the resulting diff
and keep unrelated user changes out of scope.

## Test conventions

- `npm test` runs Vitest once; there is no repository watch or coverage script.
- Tests run in Node by default. DOM tests opt in per file with
  `// @vitest-environment jsdom` and use Testing Library.
- Convex integration tests use `convex-test`, `convex/schema.ts`, and the real
  module graph. Prefer them for authentication, authorization, validation,
  transactional behavior, and downstream read-model effects.
- Test deterministic calculations and state transitions. Do not replace a
  stable boundary with sleeps or polling.
- League logic needs affected cut, withdrawal, tie, award, standings, and
  playoff cases. Consult the league/domain wiki before changing intent.
- Frontend tests should assert stable user-visible behavior rather than
  implementation details.

## Full local gate

```powershell
npm run check
```

It runs, in order:

1. `npm run format:check`
2. `npm run docs:check`
3. `npm run lint:strict`
4. `npm run typecheck`
5. `npm test`
6. `npm run convex:io-check`
7. `npm run build` and its automatic `postbuild`
8. `npm run bundle:analyze`
9. `npm run bundle:budget`

The build must precede both bundle commands because they read
`.output/public/.vite/manifest.json`. Analysis writes the ignored
`artifacts/bundle-analysis.json`.

### Convex I/O guard

`scripts/check-convex-io.mjs` is a static regression guard. It checks named hot
queries and all detected public queries for unbounded `.collect()`, rejects raw
document spreading at public boundaries, checks DTOs for known sensitive
fields, and applies representative serialized-response budgets.

It does not measure real database reads, index selectivity, subscription fanout,
or production latency. Review those separately for performance-sensitive work.

### Bundle guard

`scripts/check-bundle-budget.mjs` enforces:

| Boundary                 |             Limit |
| ------------------------ | ----------------: |
| Largest client entry     | 537,000 raw bytes |
| Initial JavaScript graph |      165 KiB gzip |
| Each async route         |        60 KiB raw |

PostHog must remain outside the initial graph. Async-route exceptions live in
`scripts/bundle-budget-exceptions.json`; each exception needs a review reason.
The file currently contains no exceptions. The current measured baseline is
over both the main-entry and initial-graph limits; see the
[known-gap entry](../KNOWN_GAPS.md#current-client-bundle-exceeds-its-guard).

## What CI adds

The `Quality` workflow runs for every pull request and push to `main` on Node
22.23.1 with `npm ci`.

| CI job              | Additional behavior                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Quality gates       | With `CONVEX_DEPLOY_KEY`, runs `npx convex codegen` and rejects generated drift; otherwise only verifies committed generated files exist. Uploads bundle analysis. |
| Dependency security | High-severity npm audit and dependency review on pull requests.                                                                                                    |
| Secret scan         | Runs a pinned, checksummed Gitleaks binary against the current tree and full Git history.                                                                          |
| CodeQL              | JavaScript/TypeScript analysis on pull requests, `main`, and Mondays at 08:23 UTC.                                                                                 |
| Dependabot          | Weekly grouped npm and GitHub Actions updates.                                                                                                                     |

`npm run check` is the complete local code-quality gate, but not the whole CI
security pipeline: it does not run codegen-drift verification, dependency
review, Gitleaks, or CodeQL.

## Manual completeness checks

When applicable, verify:

- mobile and desktop layout;
- route/search state, deep links, and notification links;
- signed-out/in, member, moderator, admin, forbidden, unavailable, and failure
  states;
- registration, pre-event, live, completed, historical, and playoff phases;
- stale, partial, duplicate, corrected, and missing integration data;
- downstream standings, badges, leaderboards, notifications, and read models;
- reversal behavior for reversible actions and confirmation/audit for
  irreversible actions.

Browser automation requires user request or approval. UI changes need mobile
and desktop evidence; motion/timing changes need a short recording.

## Failure and recovery

- Fix the first failing gate before interpreting later failures.
- A local `postbuild` message saying no `.vercel/output/functions` directory
  exists is expected; a parse/write failure when that directory exists is not.
- If generated Convex types are stale, run `npm run convex:dev` and allow it to
  finish. Never hand-edit the output.
- If a bundle check fails, inspect `artifacts/bundle-analysis.json` and the Vite
  manifest. Do not raise a limit without a measured, reviewed baseline.
- If the I/O guard passes but the feature is slow, inspect actual indexed reads,
  subscription scope, payload size, and render work; the guard is intentionally
  conservative and static.
- `npm run docs:check` verifies local inline/reference/HTML targets and heading
  anchors, Markdown table shape, wiki-index coverage, the Claude pointer,
  project-skill references, nested skill frontmatter, and skill UI metadata. It
  cannot prove prose freshness, behavioral accuracy, or external URLs; review
  those against the cited sources.

See the [command reference](../reference/COMMANDS.md),
[Deployment](DEPLOYMENT.md), and
[Security, performance, and incidents](SECURITY_PERFORMANCE_AND_INCIDENTS.md).
