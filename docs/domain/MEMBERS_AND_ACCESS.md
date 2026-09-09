# Members and Access

## Purpose and current status

Clerk authenticates the person; the Convex `members` row is PGC's application identity. It carries role, active flag, account balance, profile names, and a directed friend list. Every sensitive backend operation must resolve this row from the authenticated Clerk subject and then check role or ownership.

The root provider provisions/synchronizes a member after sign-in and supplies a small viewer bootstrap used across navigation, home, standings, and gates.

## Source paths

- Provider/bootstrap: `src/components/facilitators/Providers.tsx`, `src/convex/ViewerBootstrapProvider.tsx`
- Root shell and UI gates: `src/routes/__root.tsx`, `src/components/widgets/HardGateSignedIn.tsx`, `src/components/widgets/HardGateAdmin.tsx`
- Member operations: `convex/functions/members.ts`
- Server auth helpers: `convex/utils/auth.ts`
- Viewer/public/admin projections: `convex/utils/publicDtos.ts`
- Bootstrap read model: `convex/functions/readModels.ts`
- Frontend role/friend workflows: `src/hooks/useRoleAccess.ts`, `src/hooks/useFriendManagement.ts`
- Persisted member model: `convex/schema.ts`

## Identities and state flow

```text
signed out
  -> Clerk sign-in
  -> Convex JWT template authenticated
  -> ensureCurrentMember
      -> existing member: sync identity claims; email only when verified
      -> new member: require verified email, create regular active account
  -> getViewerBootstrap
  -> viewer/member/admin UI and server authorization
```

Roles are `regular`, `moderator`, and `admin`. `requireAdmin` accepts only admin; `requireModerator` accepts moderator or admin. UI role checks improve state presentation but never replace those server checks.

The viewer bootstrap always includes public `appState` and tour-card self-service deadline. Signed-out or not-yet-provisioned viewers receive `member: null`, no viewer cards, and no viewer badges.

## Enforced invariants, units, and boundaries

- Clerk `identity.subject` is the lookup key; callers cannot choose which member they become.
- A new member requires a verified email claim. Email is lowercased; first/last names are trimmed, limited to 80 characters, and empty values become absent.
- New rows default to role `regular`, account `0`, `friends: []`, and `isActive: true`.
- Existing rows synchronize changed name claims and a changed email only when that email claim is verified. Self-service profile editing changes names only.
- `members.account` is integer cents. Positive means credit, negative means amount owed, and zero is settled.
- Friends are directed, not mutual. Add rejects self and inactive/missing targets, deduplicates by ID, and updates only the caller's list; remove is idempotent.
- `getPublicMembers` returns at most 500 active members with display-safe identity only.
- Admins cannot deactivate their own member through `adminUpdateMemberStatus`.

The schema still permits legacy string entries in `friends`; new mutations use member IDs. Normalize legacy data through a migration rather than adding more string identities.

## UI and public behavior

The main navigation and public league surfaces render signed out. A persistent Clerk sign-in entry is available when signed out. `/account` uses a hard signed-in gate; `/admin` has signed-out, role-loading, forbidden, and admin states.

`useRoleAccess` combines Clerk load state, Convex auth, and viewer bootstrap to avoid treating an unresolved role as regular/admin. Role badges appear on the clubhouse. Standings can mark/filter the current viewer's directed friends and lets the viewer add/remove them.

Public member DTOs expose only `_id`, first/last name, and a fallback display name. Viewer DTOs add email, role, cents balance, friends, and active state. Admin DTOs add private identity/account/status needed for administration.

## Writes and downstream effects

- Provision/sync writes the canonical member identity used by cards, teams, transactions, settlements, notifications, badges, and audit logs.
- Profile updates immediately change the viewer projection. Existing result snapshots retain their stored `displayName` until their owning workflow refreshes them.
- Friend changes affect only viewer-specific highlighting/filtering.
- Admin active-status changes are audited and affect the active member directory and recipient selection in workflows that explicitly filter active members.

The compatibility `updateMembers` mutation is deliberately constrained to the caller's names. It rejects email, active-state, and friend changes.

## Failure and recovery

Missing required browser configuration renders a diagnostic for `VITE_CONVEX_URL` or `VITE_CLERK_PUBLISHABLE_KEY` rather than mounting a broken app. Failure to obtain the Convex JWT template leaves Convex unauthenticated.

If Clerk is authenticated but no member exists, `ViewerBootstrapProvider` retries `ensureCurrentMember`; an unverified/missing email claim prevents creation. Diagnose claims and identity mapping instead of accepting a client-supplied profile/email.

Duplicate or legacy identity rows should be repaired with an explicit, audited migration. Avoid deleting a member that owns league or ledger history; status changes are safer but have the limitation below.

## Authorization and privacy

- Authentication, roles, and ownership are established in Convex from `ctx.auth`.
- `HardGateSignedIn`, `HardGateAdmin`, `useRoleAccess`, and `useCanAccessResource` are presentation helpers, not security boundaries.
- Public DTOs are allowlists; do not spread a full member document into a public response.
- Member email, Clerk ID, balance, friends, subscriptions, transactions, and settlement instructions are viewer/admin private.
- The current `getCurrentMember` helper does not reject `isActive === false`. Deactivation removes a member from active lists but is not a complete account-revocation control; treat this as a known authorization gap.

## Focused tests

- `convex/hardening.test.ts`: verified identity provisioning, self-only profile writes, public DTO privacy, admin authorization, roster ownership, and bounded member reads
- `convex/utils/publicDtos.test.ts`: public/viewer projector allowlists
- `convex/clubhousePulse.test.ts`: viewer-only friend/account/card composition for the dormant pulse model
- `src/utils/leaderboardStandings.test.ts`: viewer-aware standings projection boundaries

## Reconciliation notes

- `isActive` sounds like an access revocation flag, but backend auth helpers currently allow an authenticated inactive member to continue ordinary operations.
- Moderator is a persisted role and helper capability, but most privileged operational mutations are admin-only. Document a moderator workflow only when a concrete caller exists.
- Never describe the browser's `useCanAccessResource` result as authorization; it compares Clerk IDs only for UI convenience.

## Related links

- [Product surfaces and states](../product/SURFACES_AND_STATES.md)
- [Registration and rosters](./REGISTRATION_AND_ROSTERS.md)
- [Finance and settlements](./FINANCE_AND_SETTLEMENTS.md)
- [Messaging and notifications](./MESSAGING_AND_NOTIFICATIONS.md)
- [Frontend architecture](../architecture/FRONTEND.md)
- [Backend architecture](../architecture/BACKEND.md)
- [Security, performance, and incidents](../operations/SECURITY_PERFORMANCE_AND_INCIDENTS.md)
