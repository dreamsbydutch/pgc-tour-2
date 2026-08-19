# Repository and Deployment Map

Use this reference to decide where a change belongs, what is generated, and which artifact deploys. Placement rules are enforceable in `AGENTS.md`, `eslint.config.js`, `tsconfig.json`, and the build configuration.

## Top-level map

```text
pgc/
|-- src/                 TanStack/React browser and SSR source
|-- convex/              Convex schema, functions, jobs, and backend tests
|-- public/              Static/PWA source assets
|-- email-templates/     Maintained Brevo HTML sources
|-- scripts/             Repository checks and build/deploy helpers
|-- docs/                Product/code/operations wiki
|-- .agents/skills/      Project-specific agent workflows
|-- .github/             CI, security, Dependabot, tool pointers
|-- artifacts/           Ignored generated reports
|-- .output/             Ignored Nitro build output
|-- .vercel/output/      Ignored Vercel Build Output
`-- root config          package, TypeScript, Vite, Tailwind, ESLint, Convex, Vercel
```

## Frontend source

| Path                            | Put here                                                                                         | Do not put here                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `src/routes/`                   | File route, head metadata, validated params/search, canonical URL wiring, minimal access wrapper | Direct Convex calls, reusable calculations, complex page implementation |
| `src/components/facilitators/`  | Page-level composition                                                                           | Fetching or shared domain transforms                                    |
| `src/components/displays/`      | Domain-specific presentation                                                                     | Server authority or reusable business rules                             |
| `src/components/widgets/`       | Focused interaction/access pieces                                                                | Screen-wide data orchestration                                          |
| `src/components/ui/primitives/` | Small reusable visual primitives                                                                 | Routing, auth, Convex, domain code                                      |
| `src/components/ui/composites/` | Reusable composed UI                                                                             | Application fetching/business behavior                                  |
| `src/hooks/`                    | Convex reads/writes, async state, shared workflow, UI-ready model                                | Markup-heavy UI                                                         |
| `src/utils/`                    | Pure focused calculations and formatting                                                         | React rendering, hooks, fetching                                        |
| `src/types/`                    | App-owned shapes shared across files                                                             | Duplicated generated/provider types                                     |
| `src/convex/`                   | Client API exports, provider/bootstrap integration                                               | Domain-specific browser logic                                           |
| `src/lib/`                      | Existing legacy article content only                                                             | New catch-all logic or app types                                        |
| `src/styles.css`                | Global tokens/base/layout utilities                                                              | Component-specific logic                                                |

Component imports use the barrels declared in `tsconfig.json`: `@/ui`, `@/displays`, `@/widgets`, and `@/facilitators`. Hooks use `@/hooks`; Convex client access uses `@/convex`. `@/*` remains available for focused non-component modules. ESLint rejects many forbidden deep/reverse imports.

## Convex source

| Path                                                                       | Responsibility                                                                                            |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `convex/functions/<domain>.ts`                                             | Domain public/internal queries, mutations, actions, and workflows                                         |
| `convex/utils/`                                                            | Shared backend logic: auth, audits, provider fetch/parse, scoring, standings, settlements, DTO projection |
| `convex/types/`                                                            | Backend and external integration TypeScript shapes                                                        |
| `convex/validators/`                                                       | Reusable runtime/argument validators                                                                      |
| `convex/schema.ts`                                                         | Persisted validators and indexes                                                                          |
| `convex/crons.ts`                                                          | Recurring schedules; exact one-time boundaries are scheduled by functions                                 |
| `convex/auth.config.ts`                                                    | Clerk JWT issuer/application configuration                                                                |
| `convex/*.test.ts`, `convex/functions/*.test.ts`, `convex/utils/*.test.ts` | Integration/domain/helper tests near the owning boundary                                                  |
| `convex/_generated/`                                                       | Generated Convex API/data-model/server modules                                                            |

Queries read; mutations transact; actions call external/nondeterministic services. Browser-callable operations are public and validate/authenticate their boundary. Cron, provider persistence, and implementation workflows stay internal behind narrow authorized wrappers.

## Root configuration

| File                                      | Authority                                                         |
| ----------------------------------------- | ----------------------------------------------------------------- |
| `package.json`, `package-lock.json`       | Node range, dependencies, exact npm scripts, locked install graph |
| `.nvmrc`                                  | Project Node version (`22.23.1`)                                  |
| `tsconfig.json`                           | Strict TypeScript and import aliases                              |
| `eslint.config.js`                        | Code-quality and frontend dependency-boundary rules               |
| `prettier.config.js`, `.prettierignore`   | Formatting behavior/exclusions                                    |
| `vite.config.ts`                          | TanStack/Vite/Nitro/test/build/chunk behavior                     |
| `tailwind.config.ts`, `postcss.config.js` | Styling build configuration                                       |
| `convex.json`                             | Convex runtime configuration                                      |
| `vercel.json`                             | Web framework declaration and security/reporting headers          |
| `.env.example`                            | Variable names and intended scope, never real values              |
| `.gitignore`                              | Local/generated/secret paths excluded from git                    |

`.cta.json` and parts of `components.json` contain known stale framework/path metadata. Do not use them as architectural authorities; see [known gaps](../KNOWN_GAPS.md#some-tool-configuration-is-stale).

## Source, generated, and build artifacts

| Class                    | Paths                                                                                                                                         | Rule                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Source-controlled source | `src/` except route tree; `convex/` except generated; `public/`, `email-templates/`, `scripts/`, `docs/`, `.agents/`, `.github/`, root config | Edit within task scope                                          |
| Generated and committed  | `src/routeTree.gen.ts`, `convex/_generated/*`                                                                                                 | Never hand-edit; regenerate with owner tooling and review diffs |
| Generated and ignored    | `.tanstack/`, `.nitro/`, `.output/`, `.vercel/`, `artifacts/`, `node_modules/`                                                                | Recreate; do not commit or treat as source                      |
| Local/secret and ignored | `.env.local`, `.env.development`, `.env.production`, other `.env*` except example                                                             | Never copy values into source/docs/artifacts                    |

Convex generation runs with `npm run convex:dev` and CI codegen when its deploy key is configured. TanStack route generation occurs through configured framework tooling during development/build; the repository does not expose a dedicated package script. If the generated route tree is stale, run the owning tool rather than editing the result.

## Artifact flow

```text
src/ + public/ + vite.config.ts
  -> npm run build
  -> .output/public + .output/server/index.mjs
  -> optional .vercel/output/static + functions/__fallback.func
  -> Vercel

convex/schema.ts + convex/functions|utils|types|validators + convex/crons.ts
  -> npm run convex:dev (development) / npm run convex:deploy (authorized release)
  -> Convex
```

`npm run build` automatically invokes `postbuild`, which patches generated Vercel function metadata when present. Vercel and Convex are separate compatibility/deployment units. See [deployment](../operations/DEPLOYMENT.md).

## Fast navigation

```powershell
rg --files src convex docs .agents
rg -n "createFileRoute" src/routes
rg -n "api\.functions" src/hooks
rg -n "^export const" convex/functions
rg -n "defineTable|\.index\(" convex/schema.ts
rg -n "crons\.|scheduler\." convex
rg -n "exact words" src
rg -n "describe\(|it\(" src convex -g "*.test.ts" -g "*.test.tsx"
```

Use the [code map](CODE_MAP.md) for domain entry points.

Trace both directions before editing: surface -> hook -> public operation -> canonical table/index, then canonical write -> read models/notifications -> focused tests.
