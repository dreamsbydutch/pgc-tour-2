# Authorization Implementation Summary

This doc summarizes the current authorization approach in this repo.

## Current building blocks

- Auth helpers live in `convex/auth.ts`.
- Some Convex functions derive identity via `ctx.auth.getUserIdentity()`.
- Some Convex functions still accept a `clerkId` argument for filtering and/or gating (kept for backward compatibility and existing calling patterns).

## Roles

- `regular`: normal signed-in user
- `moderator`: can manage content (e.g. golfers, tournament scoring/admin workflows)
- `admin`: full access

## How to read the codebase

- The authoritative table list is `convex/schema.ts`.
- Most backend entrypoints live in `convex/functions/*.ts` domain modules.
- Scheduled job implementations + admin cron runner live in `convex/functions/cronJobs.ts`.

## Frontend usage (current)

- Prefer querying the current member via `api.functions.members.getMembers` with `options.clerkId`.

```ts
const member = useQuery(
  api.functions.members.getMembers,
  user ? { options: { clerkId: user.id } } : "skip",
);
```

For table-by-table role guidance, see `docs/admin-authorization.md`.
