# Convex Backend Architecture

Use this page for public/internal function placement, authentication, DTOs, indexed reads, transactions, external actions, scheduled workflows, and downstream read models. The current behavior lives in `convex/`; the schema and tests override summaries here when they disagree.

## Module placement

| Path                    | Responsibility                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `convex/functions/`     | Domain queries, mutations, actions, workflows, and narrow public admin wrappers             |
| `convex/utils/`         | Reusable backend calculations, auth, DTO projectors, provider helpers, batching, and audits |
| `convex/types/`         | Backend/provider TypeScript boundaries                                                      |
| `convex/validators/`    | Reused Convex/runtime validators                                                            |
| `convex/schema.ts`      | Tables, field validators, and indexes                                                       |
| `convex/crons.ts`       | Recurring schedules only                                                                    |
| `convex/auth.config.ts` | Clerk JWT provider configuration                                                            |
| `convex/_generated/`    | Generated API/model/server types; never hand-edit                                           |

Keep domain entry points in a named function module rather than a catch-all. `cronJobs.ts` and `readModels.ts` are large established orchestration modules; their size is not permission to place unrelated logic there.

## Pick the correct function type

| Type               | Use                                             | Constraints                                                                                 |
| ------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `query`            | Client-readable deterministic data              | Validate args, bound/index reads, return explicit DTOs                                      |
| `internalQuery`    | Server-only deterministic reads                 | Not callable from the browser; still bound hot/recurring work                               |
| `mutation`         | Client-triggered transactional write            | Authenticate/authorize on server, validate invariants, update dependent transactional state |
| `internalMutation` | Scheduled/workflow transaction or repair page   | Internal implementation; bounded and idempotent when retryable                              |
| `action`           | Client-triggered external/nondeterministic work | Authenticate in the action, then call internal operations; never trust client actor IDs     |
| `internalAction`   | Scheduled/provider orchestration                | Timeouts/retries/validation, leases where concurrent, internal persistence calls            |

Do not expose an internal job as public merely to call it from a UI. Add a narrow authenticated wrapper that records the actor and invokes the internal workflow.

## Authentication and authorization

Clerk issues the identity JWT; Convex validates it using `convex/auth.config.ts`. `convex/utils/auth.ts` is the shared authority:

- `requireAuth` derives the Clerk subject from `ctx.auth`.
- `getCurrentMember` resolves the indexed member record.
- `requireAdmin` and `requireModerator` check the persisted role.
- `requireAdminForAction` performs the equivalent internal lookup for actions.
- ownership checks compare the authenticated member/resource on the server.

Roles are `regular`, `moderator`, and `admin`. A frontend hard gate improves UX only. Every private query and sensitive mutation/action independently authenticates; admin and moderator capabilities are explicit, not implied by hidden navigation.

New member provisioning uses verified identity claims and ignores client-supplied identity fields. Public responses never expose Clerk subjects, email, balance, friend IDs, push endpoints, or audit internals unless the authenticated viewer/admin DTO explicitly owns them.

## Bounded reads and DTOs

Prefer one screen-oriented indexed query to many row-level subscriptions.

- Use `.withIndex(...)`, `.take(n)`, or pagination for recurring reads.
- Do not use unbounded `.collect()` in public or hot paths.
- Return explicit public/viewer/admin shapes; `convex/utils/publicDtos.ts` fails closed when source documents gain fields.
- Keep public home data viewer-independent. Private viewer state belongs in `getViewerBootstrap` or an authenticated query.
- Return shells/lists first and load team history, roster detail, or scorecards on demand.
- Keep sort/group work close to the indexed data source unless it is genuinely a UI-only projection.

`npm run convex:io-check` statically protects named hot queries, raw-document spreads, sensitive DTO fields, and representative payload budgets. It is a regression guard, not measured database I/O; focused integration tests still prove behavior.

## Write and correction flow

The normal sensitive write is:

```text
ctx.auth identity
  -> indexed member + role/ownership
  -> argument/domain validation
  -> transactional canonical write
  -> transactional mirrors/audit where required
  -> scheduled or immediate downstream rebuild
  -> notification only after the domain write succeeds
```

Canonical tournament corrections may require:

```text
tournament golfer identity/performance
  -> team rounds, totals, positions, points, payouts
  -> standings contribution
  -> standings row/ranks/playoff assignment
  -> tour-card legacy mirror
  -> playoff reconciliation
  -> major badges and other read models
  -> appState/public version
  -> eligible final-result message
```

Do not patch a materialized row in isolation when its source is wrong. Fix the write path, repair canonical data, then rebuild in dependency order. See [data model](DATA_MODEL.md) and [data repairs](../operations/DATA_REPAIRS.md).

## Jobs, leases, and external work

Scheduled jobs are internal, self-gating, retry-safe, and observable. `syncRuns` records job/run identity, trigger, lease/status, actor/tournament, counts, duration, skip reason, and error. `appState` owns the small public timeline and live-chain markers. Domain-specific state such as `tournamentSyncState`, email guards, and notification-delivery leases prevents duplicate external work.

Use bounded mutation batches after an external action returns validated data. Normalize before equality checks and skip unchanged writes. A provider request or email response is not a transaction: persist only confirmed intended outcomes and make partial failure recoverable.

See [tournament lifecycle](../domain/TOURNAMENT_LIFECYCLE.md), [admin and automation](../operations/ADMIN_AND_AUTOMATION.md), and [integrations](INTEGRATIONS.md).

## Validation and error behavior

- Validate every public argument with Convex validators and refine domain constraints in the handler.
- Parse external JSON from `unknown`; retain valid siblings when a partial feed permits it.
- Use explicit skipped reasons for benign self-gating and errors for failed invariants/external work.
- Do not log secrets, full member records, roster payloads, raw provider responses, or payout details.
- Treat missing parents, duplicate logical keys, ambiguous identities, and impossible score mappings as investigation states, not values to guess.
- Use current server time for privacy and mutation boundaries; cached UI state cannot override it.

## Verification

Backend behavior needs focused tests for anonymous, wrong-owner, wrong-role, invalid input, exact boundaries, duplicate/rerun behavior, partial/corrected source data, downstream state, DTO privacy, and bounded payloads. Use `convex-test` with the real schema/module graph. Run `npm run convex:io-check` for public/read-model changes and `npm run typecheck` when generated/API surfaces change.

Related: [data model](DATA_MODEL.md), [integrations](INTEGRATIONS.md), [quality](../operations/QUALITY_AND_TESTING.md), and the `$pgc-convex-boundaries` skill.
