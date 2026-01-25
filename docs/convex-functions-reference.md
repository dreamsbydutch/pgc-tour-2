# Convex Functions Reference

This is a high-level index of backend modules under `convex/functions/`.

For exact function names and types, prefer using the generated `api`/`internal` objects from `convex/_generated/api` (autocomplete stays accurate as modules change).

## Function paths

- Public functions: `api.functions.{module}.{exportName}`
- Internal-only functions: `internal.functions.{module}.{exportName}`

## Current domain modules (`convex/functions/*.ts`)

- `courses` — course CRUD
- `golfers` — golfer CRUD + DataGolf-driven sync utilities (e.g. `syncGolfersFromDataGolf`)
- `members` — member CRUD + admin tooling
- `seasons` — season CRUD + standings view payloads
- `teams` — team CRUD + leaderboard helpers
- `tiers` — tier CRUD
- `tourCards` — tour card CRUD + standings helpers
- `tournaments` — tournament CRUD + tournament page/leaderboard payloads
- `tours` — tour CRUD
- `transactions` — ledger workflows + admin/audit views
- `emails` — email previews/sends + internal recipient helpers
- `datagolf` — DataGolf API wrappers (actions)
- `cronJobs` — scheduled job implementations + admin cron runner

## Internal utilities (not called directly from the frontend)

These are implementation helpers used by the domain modules.

- `_auditLog` — helper used to write to the `auditLogs` table
- `_authByClerkId` — helper for resolving a member from Clerk identity
- `_externalFetch` — shared fetch/retry utilities for actions
- `_constants`, `_utils` — shared internal constants/helpers

## Notes

- Some tables exist in `convex/schema.ts` without a dedicated public `api.functions.{module}` wrapper yet (e.g. `pushSubscriptions`, `auditLogs`). In those cases, treat the schema as the source of truth until a corresponding functions module is added.

4. **Check function signatures** in TypeScript for exact parameter types
5. **Monitor audit logs** for debugging admin operations
6. **Use bulk operations** for data imports and migrations
