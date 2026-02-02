# Security Notes (Non-breaking)

This doc captures how to think about security in this repo without introducing unexpected breaking changes.

## Identity source of truth

Prefer deriving identity on the server:

- `ctx.auth.getUserIdentity()`

Avoid trusting client-provided identity (`clerkId` args) for sensitive operations.

## Roles

Roles live on the `members` table.

- Use server checks for admin/moderator actions.

## Principle of least privilege

- Keep cron and back-office workflows internal-only.
- Use `internalQuery`/`internalMutation`/`internalAction` for server-only operations.

## Avoid surprise hardening

This codebase has historical endpoints that accept `clerkId` and do not enforce strict access.

If you want to harden endpoints:

- do it incrementally
- coordinate client changes
- consider transitional options (accept both patterns temporarily)

See also:

- [../backend/auth-and-identity.md](../backend/auth-and-identity.md)
