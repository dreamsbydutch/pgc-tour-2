# Convex Overview (This Repo)

Convex provides the database and server-side functions for PGC.

## Where things live

- Schema: `convex/schema.ts`
- Functions: `convex/functions/*.ts`
- Validators: `convex/validators/*.ts`
- Shared server utilities: `convex/utils/*.ts`
- Shared server types: `convex/types/*.ts`
- Cron definitions: `convex/crons.ts`
- Auth helpers: `convex/auth.ts` and `convex/auth.config.ts`
- Generated types: `convex/_generated/*` (do not edit)

## Function types

Use the correct Convex primitive based on behavior:

- `query` — deterministic reads
- `mutation` — writes
- `action` — external/non-deterministic work (network calls, third-party APIs)

This repo also uses internal-only variants:

- `internalQuery`, `internalMutation`, `internalAction`

## API paths

Convex modules map to API paths based on file path.

Example:

- `convex/functions/seasons.ts` exports become `api.functions.seasons.<exportName>`

The frontend re-exports `api` and Convex hooks from `src/convex/index.ts`.

## Conventions

- Prefer CRUD-style functions per table.
- For hot screens, add a small number of convenience queries (instead of client-side N+1).
- Keep args validated with `v` validators.
- Prefer indexed reads via `.withIndex(...)`.

See also:

- [functions-and-modules.md](functions-and-modules.md)
- [schema-and-indexes.md](schema-and-indexes.md)
- [auth-and-identity.md](auth-and-identity.md)
- [cron-and-jobs.md](cron-and-jobs.md)
- [external-integrations.md](external-integrations.md)
