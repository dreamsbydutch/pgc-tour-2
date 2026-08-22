# Command reference

> Purpose: provide the exact repository commands and their side effects. The
> authoritative definitions are the `scripts` object in
> [`package.json`](../../package.json) and the current files under
> [`scripts/`](../../scripts). Return to the [wiki index](../README.md).

Use Node 22 (`.nvmrc` pins 22.23.1) and npm. Start by preserving the worktree:

```powershell
git status --short
```

## Install and run

| Command                      | Exact repository behavior                        | Side effects or prerequisites                                       |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| `npm ci`                     | Install the committed lockfile exactly           | Replaces `node_modules`; preferred for clean setup and CI           |
| `npm install`                | Resolve/install dependencies                     | May update `package-lock.json`; use for intentional dependency work |
| `npx convex dev --configure` | Select/configure a Convex development deployment | External development configuration; may stay running                |
| `npm run dev`                | `vite dev --port 3000 --host`                    | Port 3000; can listen beyond loopback                               |
| `npm run convex:dev`         | `convex dev`                                     | Watches backend and regenerates committed `convex/_generated/`      |
| `npm run serve`              | `vite preview`                                   | Requires a production build                                         |
| `npm start`                  | `node .output/server/index.mjs`                  | Requires `.output` from a build                                     |

Run frontend and Convex development in separate terminals.

## Verify and format

| Command                                | Exact repository behavior                                          | Notes                                      |
| -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------ |
| `npm test`                             | `vitest run`                                                       | All tests, once                            |
| `npx vitest run <test-file>`           | Focused Vitest run                                                 | Preferred during narrow iteration          |
| `npm run typecheck`                    | `tsc --noEmit`                                                     | Strict project-wide TypeScript             |
| `npm run lint`                         | ESLint `src`, `convex`, and `scripts`                              | Warnings allowed                           |
| `npm run lint:strict`                  | Same with `--max-warnings 0`                                       | Release/CI lint gate                       |
| `npx eslint <changed-files>`           | Focused ESLint                                                     | Use explicit paths                         |
| `npm run lint:fix`                     | ESLint with `--fix`                                                | Modifies files; inspect the diff           |
| `npm run format:check`                 | Prettier check over the repository                                 | Includes Markdown; ignores generated files |
| `npx prettier --check <changed-files>` | Focused Prettier check                                             | Use explicit paths                         |
| `npm run format`                       | Prettier write over the repository                                 | Broadly modifies files; use deliberately   |
| `npm run convex:io-check`              | Static public-query/DTO/response-budget guard                      | Required for Convex read/write changes     |
| `npm run docs:check`                   | Validate wiki links/navigation, Claude pointer, and skill metadata | Dependency-free documentation guard        |

## Build and bundle

| Command                  | Exact repository behavior                                                                                          | Output or prerequisite                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `npm run build`          | `vite build`, then automatic `postbuild`                                                                           | Usually writes ignored `.output/`; Vercel builds may write `.vercel/output/` |
| `npm run postbuild`      | Patch generated Vercel functions to runtime `nodejs20.x`                                                           | Skips when `.vercel/output/functions` is absent; normally automatic          |
| `npm run bundle:analyze` | Analyze `.output/public/.vite/manifest.json`                                                                       | Requires build; writes ignored `artifacts/bundle-analysis.json`              |
| `npm run bundle:budget`  | Enforce entry/initial/route budgets and initial PostHog exclusion                                                  | Requires build                                                               |
| `npm run check`          | Format -> docs/skills -> strict lint -> typecheck -> tests -> Convex I/O -> build/postbuild -> analysis -> budgets | Complete local release-quality gate                                          |

## Convex and external-state commands

| Command                                                        | Effect                                                          | Authorization                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `npx convex codegen`                                           | Regenerate Convex API/data-model files                          | CI uses it when `CONVEX_DEPLOY_KEY` is available; do not hand-edit output      |
| `npm run convex:deploy`                                        | `convex deploy`                                                 | Deploys the configured backend; production use requires explicit authorization |
| `npx convex run functions/module:functionName '<json>'`        | Invoke a function against the configured development deployment | Confirm function visibility, arguments, and side effects                       |
| `npx convex run --prod functions/module:functionName '<json>'` | Invoke against production                                       | Requires explicit authorization for that exact function and target             |
| `npm run security:dependencies`                                | `npm audit --audit-level=high`                                  | Read-only dependency assessment; network required                              |

PowerShell examples should remain on one line; Bash `\` continuation does not
work in PowerShell. Never put a credential directly in a command that will be
logged or copied.

## Common recipes

### First local setup

```powershell
npm ci
npx convex dev --configure
```

Then run `npm run convex:dev` and `npm run dev` in separate terminals.

### Narrow TypeScript change

```powershell
npx vitest run path/to/affected.test.ts
npx eslint path/to/changed.ts
npx prettier --check path/to/changed.ts
npm run typecheck
```

### Convex boundary change

```powershell
npx vitest run convex/path/to/affected.test.ts
npm run convex:io-check
npm run typecheck
```

Add focused authentication, authorization, validation, idempotency, and
downstream-state cases as applicable.

### Release candidate

```powershell
npm run check
npm run security:dependencies
```

The second command is part of CI security, not `npm run check`. Gitleaks,
dependency review, and CodeQL run in GitHub and have no complete local wrapper.

### Approved paginated repair shape

Development:

```powershell
npx convex run functions/module:functionName '{"cursor":null,"limit":200}'
```

Production, only after explicit approval:

```powershell
npx convex run --prod functions/module:functionName '{"cursor":null,"limit":200}'
```

Use the current function's validator and returned `continueCursor`; this is a
shape, not authorization or a guarantee every repair accepts those fields.

## Generated and ignored paths

| Path                                | Rule                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `convex/_generated/`                | Generated and committed; regenerate through Convex, never hand-edit                     |
| `src/routeTree.gen.ts`              | Generated and committed; regenerate through TanStack dev/build tooling, never hand-edit |
| `.output/`, `.nitro/`, `.tanstack/` | Ignored local build/framework output                                                    |
| `.vercel/`                          | Ignored local/deployment metadata and generated Vercel output                           |
| `artifacts/`                        | Ignored analysis output                                                                 |
| `.env*` except `.env.example`       | Ignored configuration that may contain secrets                                          |

## Commands that do not exist

There is currently no repository command for:

- frontend/Vercel deployment or promotion;
- production rollback;
- test coverage or a coverage threshold;
- an end-to-end browser suite;
- a complete local equivalent of all CI security jobs.

Do not invent these steps. See [Local development](../operations/LOCAL_DEVELOPMENT.md),
[Quality and testing](../operations/QUALITY_AND_TESTING.md),
[Deployment](../operations/DEPLOYMENT.md), and
[Data repairs](../operations/DATA_REPAIRS.md).
