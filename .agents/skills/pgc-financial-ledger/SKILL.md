---
name: pgc-financial-ledger
description: Explain, diagnose, test, or change PGC member balances, transactions, tour-card fees, official earnings, and season-end settlements. Use for cents, credits/debits, allocations, e-transfers, donations, next-season card reserves, cancellations, authorization, or financial audits.
---

# PGC financial ledger

Read `docs/LEAGUE_AND_APP_GUIDE.md` before changing earnings or payouts. Treat `convex/schema.ts`, `convex/utils/settlements.ts`, and current tests as the enforced financial contract.

## Preserve ledger invariants

- Store every amount as a safe integer number of cents. Positive transactions credit the member; negative transactions debit them. Format currency only at the UI boundary.
- Write the transaction and matching `members.account` change in the same mutation. Never adjust one without the other.
- Count legacy transactions with no status and transactions with `completed`; exclude pending, failed, and cancelled rows from official credited totals.
- Derive identity and admin role from `ctx.auth`. Return viewer-safe DTOs and audit every fee, payment, settlement, cancellation, and administrative change.
- Treat notification as a consequence of a successful financial write, not proof that the write occurred.

## Tour-card fees and payments

- Charge at most one completed `TourCardFee` per member per season, even when the member holds multiple tour cards. Use the tour buy-in and persist it as a negative transaction.
- When the final tour card for a season is deleted before self-service closes, remove that season's fee rows and reverse their completed total on the account. Preserve the fee while another card remains.
- Require admin access for recorded payments; reject zero and non-integer amounts. A positive payment raises the balance and a negative payment lowers it.

## Settle official earnings

Official season earnings are the non-negative rounded earnings across the member's tour cards. A negative account first offsets earnings:

```text
accountOffset = min(earnings, max(0, -accountBalance))
available = max(0, earnings - accountOffset)
```

Accept a request only for the current completed season, with positive availability and no active or completed request for that season. Require the four allocations to equal `available` exactly:

- e-transfer;
- charity donation;
- league donation;
- next-season card: either `0` or exactly `10_000` cents.

Require a normalized payout email only when transfer is positive. Before every item, verify official earnings still equal the submitted snapshot. If they changed while the request is pending, cancel and resubmit; if processing already started, the current cancellation path cannot recover it, so surface the workflow gap instead of improvising a reversal. Compute missing `TournamentWinnings` as official earnings minus completed/legacy winnings already credited for that member/season, reject an over-credit, then debit transfer/charity/league exactly once. The next-season card item is a reserve marker, not an immediate debit. Mark the request completed only when every non-zero item is complete.

Allow cancellation only while pending, require a reason, preserve the audit trail, and never reverse a partially processed request automatically.

## Trace and test changes

Trace `tourCards/teams -> official earnings -> settlement request -> transactions -> members.account -> account DTO/UI -> audit/notification`. Primary code is in `convex/functions/account.ts`, `transactions.ts`, `settlements.ts`, `tourCards.ts`, and `convex/utils/settlements.ts`.

Use focused tests for cents validation, sign direction, duplicate fees/requests/items, capacity-related deletion, negative-account offset, full allocation, changed earnings, insufficient balance, next-card reserve, authorization, audit rows, and rerun idempotency. Assert both transactions and the materialized member balance.
