---
name: pgc-financial-ledger
description: Explain, diagnose, test, or change PGC balances, transactions, tour-card fees and refunds, payments, official earnings, settlements, cancellations, and financial audits. Use for cent-denominated money and account invariants; roster eligibility and standings use their domain skills.
metadata:
  short-description: Protect the PGC financial ledger
---

# PGC financial ledger

Read [finance and settlements](../../../docs/domain/FINANCE_AND_SETTLEMENTS.md) and [members and access](../../../docs/domain/MEMBERS_AND_ACCESS.md). Treat `convex/schema.ts`, `convex/utils/settlements.ts`, and focused tests as the enforced contract.

## Scope and handoffs

Own member balances, ledger transactions, tour-card fee/refund semantics, recorded payments, official earnings, settlement requests/items, cancellation, authorization, and financial audits.

- Use `$pgc-registration-and-picks` for card ownership, capacity, and registration eligibility.
- Use `$pgc-standings-read-model` for official standings and tournament contribution aggregation.
- Use `$pgc-member-messaging` only for notifications caused by a successful financial write.

## Preserve ledger invariants

- Store money as safe integer cents; format currency only at the presentation boundary.
- Positive transactions credit and negative transactions debit. Update the transaction and matching materialized member balance atomically.
- Derive member identity and admin role from server authentication, return role-appropriate DTOs, and audit sensitive changes.
- Make fees, payments, winnings, settlement items, and cancellations idempotent under retry.
- Treat `transactions.createPayment` as a documented exception today: it has no idempotency key or duplicate guard, so inspect the ledger before retrying an uncertain admin submission.
- Distinguish pending, completed, failed, cancelled, and legacy transaction status when calculating official totals.
- Snapshot and recheck official earnings during settlement processing; do not improvise reversals for partially processed work.
- Treat notification delivery as a consequence, never as proof of a ledger write.

## Trace and verify

Trace tour cards and completed results to official earnings, settlement request/items, transactions, `members.account`, account DTO/UI, audit, and notification. Primary code is in `convex/functions/account.ts`, `convex/functions/transactions.ts`, `convex/functions/settlements.ts`, `convex/functions/tourCards.ts`, and `convex/utils/settlements.ts`.

Test integer cents, sign direction, duplicate fees/requests/items, last-card refund, negative-balance offset, full allocation, changed earnings, insufficient balance, cancellation states, next-season reserve, authorization, audit rows, and rerun idempotency. Assert both ledger rows and the materialized balance.
