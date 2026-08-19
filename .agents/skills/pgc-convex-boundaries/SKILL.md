---
name: pgc-convex-boundaries
description: Design, diagnose, test, or change PGC Convex queries, mutations, actions, Clerk identity and roles, public DTOs, indexes, pagination, read models, subscriptions, privacy, and I/O budgets. Use for backend boundaries; business rules use their domain skills.
metadata:
  short-description: Protect PGC Convex boundaries
---

# PGC Convex boundaries

Read the [backend architecture](../../../docs/architecture/BACKEND.md), [data model](../../../docs/architecture/DATA_MODEL.md), [members and access](../../../docs/domain/MEMBERS_AND_ACCESS.md), and [security and performance runbook](../../../docs/operations/SECURITY_PERFORMANCE_AND_INCIDENTS.md).

## Scope and handoffs

Own public versus internal Convex operation design, authentication and role boundaries, argument validation, query/index/pagination shape, public/viewer/admin projections, screen read models, subscription size, and cross-domain I/O performance.

Use the relevant domain skill for business invariants. Use `$pgc-data-repairs` for persisted transformations and `$pgc-frontend-flows` for UI view-model and rendering concerns.

## Preserve backend boundaries

- Use queries for reads, mutations for transactional writes, and actions for external or nondeterministic work.
- Keep scheduled, integration, and server-only operations internal. Public sensitive operations derive identity and role from `ctx.auth` and server member records.
- Validate every public argument, ownership relationship, state transition, and external result.
- Use indexes and bounded reads; paginate history and admin lists. Avoid public hot-path `.collect()`, browser-side joins, and N+1 subscriptions.
- Return explicit screen-oriented DTOs. Never spread raw documents or expose server-only identity, integration, lease, or audit fields.
- Update denormalized and materialized state transactionally or schedule a complete idempotent rebuild.
- Keep jobs bounded, leased, restartable, and auditable where sensitive.

## Trace and verify

Trace route need to hook, typed operation, `convex/functions/` entry point, `convex/utils/` helpers, validators, `convex/schema.ts` indexes, DTO projector, and downstream consumers. Inspect `scripts/check-convex-io.mjs` before changing a protected public read.

Test signed-out/member/moderator/admin access, ownership, argument validation, state conflicts, idempotency, partial or missing references, DTO privacy, pagination boundaries, payload size, and downstream refresh. Run focused tests, ESLint, Prettier, typecheck, and `npm run convex:io-check` for read/write boundary changes.
