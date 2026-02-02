# Auth and Identity (Clerk + Convex)

Frontend authentication is handled by Clerk; Convex uses Clerk JWTs for request identity.

## Frontend provider wiring

Providers are mounted in `src/routes/__root.tsx` and implemented in `src/components/facilitators/providers/Providers.tsx`.

The provider stack:

- `ClerkProvider`
- `ConvexProviderWithClerk`
- optional `PostHogProvider` (when `VITE_POSTHOG_KEY` is set)

A repo-specific detail: the provider uses a wrapper hook that always requests the `template: "convex"` JWT when calling `getToken`.

## Convex auth configuration

- `convex/auth.config.ts` configures the Clerk JWT issuer domain.

Required server env var:

- `CLERK_JWT_ISSUER_DOMAIN`

## Server-side auth helpers

- `convex/auth.ts` includes helpers like `requireAuth`, `getCurrentMember`, `requireAdmin`, etc.

Important repo note:

- Not every Convex function in this codebase enforces authorization consistently.
- Many functions historically accept a `clerkId` argument from the client.

When improving auth:

- Avoid breaking changes unless explicitly planned.
- Prefer server-derived identity via `ctx.auth.getUserIdentity()`.
- Use `getCurrentMember(ctx)` for role checks.

## Role model

Roles live on the `members` table:

- `admin`
- `moderator`
- `regular`

See also:

- [convex-overview.md](convex-overview.md)
- [../getting-started/environment-variables.md](../getting-started/environment-variables.md)
- [../operations/security-notes.md](../operations/security-notes.md)
