# Finance and Settlements

## Purpose and current status

PGC tracks each member's signed account balance, transaction records, official fantasy earnings, and season-end allocation instructions. Every monetary value is integer cents; formatting into CAD belongs at the presentation boundary.

The admin payment and settlement-processing UI is wired. The member account page currently renders only profile, balance, logout, and notification center. Its hook computes the full settlement workflow, but no settlement form/status/history component consumes that state, and `getMyTransactions` has no frontend caller.

## Source paths

- Persisted ledger/settlement model: `convex/schema.ts`
- Account overview: `convex/functions/account.ts`
- Transaction queries and admin payment: `convex/functions/transactions.ts`
- Settlement workflow: `convex/functions/settlements.ts`, `convex/utils/settlements.ts`
- Registration fees: `convex/functions/tourCards.ts`, `convex/utils/tourCards.ts`
- Official earnings source: `convex/utils/standings.ts`
- Member hook/page: `src/hooks/useAccountPage.ts`, `src/components/facilitators/AccountPage.tsx`, `src/utils/account.ts`
- Admin UI: `src/hooks/useAdminDashboard.ts`, `src/components/facilitators/AdminDashboard.tsx`

## Identities and state flow

Account signs are consistent across the app:

- Negative: the member owes money and cannot submit tournament picks.
- Zero: settled.
- Positive: credit available to the member.

```text
tour-card registration -> negative TourCardFee -> account debt
admin payment           -> signed Payment       -> account adjustment
completed team awards   -> tour-card official earnings
season complete         -> settlement request
admin completes item    -> missing winnings credit, then real allocation debit
                        -> request completed when every nonzero item is done
```

Settlement status is `pending -> in_progress -> completed`. An admin may change `pending -> cancelled`; processing cannot be cancelled after it starts. A cancelled request can be resubmitted for the same season.

## Enforced invariants, units, and boundaries

- `transactions.amount` and `members.account` are signed cents: positive is credit, negative is debit.
- Transaction types are `TourCardFee`, `TournamentWinnings`, `Withdrawal`, `Deposit`, `LeagueDonation`, `CharityDonation`, `Payment`, `Refund`, and `Adjustment`; status is optional for legacy rows or `pending`, `completed`, `failed`, `cancelled`.
- The first completed tour-card fee per member/season debits the account. A second tour card in that season does not add a fee. Deleting the final card before the self-service cutoff deletes the fee rows and reverses their completed net amount.
- Admin payment requires a nonzero safe-integer cent amount and adjusts account by that signed value.
- `transactions.createPayment` has no caller-supplied idempotency key or duplicate guard. A repeated admin submission records and applies the payment again; do not blindly retry an uncertain response.
- Official settlement earnings are the sum of each season card's nonnegative, rounded `tourCard.earnings` mirror.
- A request is allowed only for the current season after `appState.seasonPhase === "completed"` or `season.endDate <= now`.
- One pending/in-progress request anywhere blocks another. A completed request blocks another for the same season.
- Existing debt consumes earnings first: `accountOffset = min(earnings, max(0, -account))`; only the remainder is allocatable.
- Transfer, charity, league, and next-season-card amounts must be nonnegative safe-integer cents and must allocate the full available remainder exactly.
- Next-season card allocation is either zero or exactly 10,000 cents. A positive transfer requires a normalized, valid payout email.

When an admin completes the first item, the backend re-reads official earnings. It rejects changed earnings, excess pre-existing winnings credit, or insufficient account funds. It credits any missing official `TournamentWinnings` once, then debits transfer/charity/league items. A next-season-card item is marked reserved without an immediate debit so that the balance can fund the next registration fee.

## UI and public behavior

The clubhouse shows no alert at zero, a credit link to `/account` when positive, and an amount-owed warning when negative. The roster mutation—not the alert—enforces the negative-balance pick lock.

`/account` is signed-in-only and currently shows editable names and formatted balance. Despite its introductory copy saying “review your history,” it does not render tournament history, transaction history, achievements, tour-card history, or settlement allocation controls.

The admin dashboard is wired to list settlement requests, preview/record payments, complete individual requested items, and cancel pending requests with confirmation. Financial mutations generate in-app/push notification events for the affected member or active admins.

## Writes and downstream effects

- Registration fee, payment, winnings credit, withdrawal, and donation writes update both a transaction row and `members.account` in the same Convex transaction.
- Each settlement item stores completion time/admin identity; the request stores snapshots of official earnings, debt offset, allocations, and payout email.
- Financial writes produce audit logs. Payment, submission, item completion, and cancellation also publish deduplicated financial notifications.
- Official earnings originate in completed team awards, then flow through contributions/materialized standings into the tour-card mirror used by settlement.

Any correction after a request was submitted intentionally fails item completion if the official earnings snapshot changed. Cancel the still-pending request and have the member resubmit after standings are repaired.

## Failure and recovery

Never “balance” the system by editing `members.account` alone. Reconcile the member's signed transactions, official earnings, request item timestamps, and audit entries; then use an authorized compensating transaction or a reviewed repair.

Completion is idempotent per item: an already completed item returns without a second debit. A completed request is also safe to retry. Cancellation is idempotent only while already cancelled; an in-progress request requires manual investigation because the API correctly refuses reversal after external work may have occurred.

Legacy rows with undefined transaction status are treated as completed in fee/winnings calculations. Include them in audits.

## Authorization and privacy

- Members can read only their overview/transactions and submit only their own current-season settlement.
- Payments, request listing, item completion, and cancellation require a server-resolved admin.
- Payout email, balance, transactions, allocation instructions, administrator completion IDs, and cancellation reasons are private viewer/admin data.
- Public standings may expose league earnings but never the member's cash-account balance or payout destination.

## Focused tests

- `convex/settlements.test.ts`: season eligibility, debt offset, exact allocation, resubmission, winnings credit, item idempotency, cancellation, authorization, and audits
- `convex/hardening.test.ts`: registration fees, payment authorization/validation, account pick gate, and ownership
- `src/utils/account.test.ts`: CAD input/cents conversion and allocation totals
- `src/utils/adminOperations.test.ts`: payment/settlement admin previews and confirmation boundaries

## Reconciliation notes

- `useAccountPage` implements settlement inputs/actions, but `AccountPage` does not render them. Do not describe member self-service settlement as shipped UI.
- `transactions.getMyTransactions` is implemented and private but currently unwired.
- The `AccountPage` docblock references a nonexistent `membersViews.getMyTournamentHistory` source and claims a rendered history table that does not exist.
- Settlement correctness depends on the tour-card compatibility mirror being synchronized from materialized standings; repair the canonical result chain before settling.
- Admin payment creation is atomic but not retry-idempotent. The workflow needs a stable operation key or reviewed duplicate-detection rule before agents can treat transport retries as safe.

## Related links

- [Registration and rosters](./REGISTRATION_AND_ROSTERS.md)
- [Standings and playoffs](./STANDINGS_AND_PLAYOFFS.md)
- [Members and access](./MEMBERS_AND_ACCESS.md)
- [Messaging and notifications](./MESSAGING_AND_NOTIFICATIONS.md)
- [Data model](../architecture/DATA_MODEL.md)
- [Admin and automation](../operations/ADMIN_AND_AUTOMATION.md)
- [Data repairs](../operations/DATA_REPAIRS.md)
