---
name: pgc-registration-and-picks
description: Explain, diagnose, test, or change PGC registration, tour-card switching or deletion, capacity, pick windows, ten-golfer group validation, pre-start privacy and substitution, playoff picks, and roster inheritance. Use for eligibility and roster state; ledger and scoring use their domain skills.
metadata:
  short-description: Maintain PGC registration and picks
---

# PGC registration and picks

Read [registration and rosters](../../../docs/domain/REGISTRATION_AND_ROSTERS.md), [product surfaces and states](../../../docs/product/SURFACES_AND_STATES.md), and [finance and settlements](../../../docs/domain/FINANCE_AND_SETTLEMENTS.md) when fees affect the workflow.

## Scope and handoffs

Own tour-card registration/switch/delete eligibility, tour capacity, pick-window enforcement, roster validation and privacy, pre-start substitution, playoff qualification checks at submission, and later-event roster inheritance.

- Use `$pgc-financial-ledger` for fee/refund transaction and account invariants.
- Use `$datagolf-api` for provider field, ranking, or golfer identity.
- Use `$pgc-golf-scoring` for terminal-state and carryover calculations.
- Use `$pgc-standings-read-model` for qualification derivation and persisted standings.

## Preserve roster invariants

- Derive the member from server authentication and enforce ownership, season/tour alignment, capacity, status, balance, and exact time boundaries.
- Keep member, tour card, tournament team, golfer, and tournament-golfer identities distinct.
- Create or update the card/team and required denormalized counts/identity atomically and idempotently.
- Validate roster size, uniqueness, tournament-specific grouped eligibility, and per-group limit on the server.
- Before the tournament starts, expose only the authenticated member's own roster detail.
- Replace a pre-start non-starter only with sufficient provider evidence and the documented same-group eligibility; never substitute after evidence of play.
- Derive playoff eligibility from current standings, accept picks only at the documented playoff entry point, and audit inherited/reconciled roster changes.

## Trace and verify

Trace registration UI/hook to `convex/functions/tourCards.ts` and ledger/count changes; trace picks UI/hook to pick-pool reads, `convex/functions/teams.ts`, pre-start private detail, and public leaderboard. Tournament timing comes from `convex/functions/tournaments.ts` and lifecycle state.

Test exact boundaries, cancelled first events, ownership, season alignment, capacity, duplicate fee/card behavior, last-card refund trigger, roster/group validation, negative balance, create/update retry, pre-start privacy, substitution evidence, qualification, and carryover inheritance.
