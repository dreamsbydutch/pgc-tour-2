# Data Model (Concepts)

The authoritative schema is defined in `convex/schema.ts`.

## Core entities

### Members

- Table: `members`
- Represents application users linked to Clerk.
- Key fields: `clerkId`, `email`, `role`, `account` (cents), `friends`.

### Seasons

- Table: `seasons`
- A season groups tours, tiers, tournaments, transactions.

### Tours, tiers, and tournaments

- `tours`: a tour within a season (buy-in, limits, etc.)
- `tiers`: payout/points configuration per season
- `tournaments`: tournaments within a season, linked to `tierId` and `courseId`

### Tour cards

- Table: `tourCards`
- Represents a member’s participation identity within a season/tour (display name + accumulated stats).

### Teams

- Table: `teams`
- A tour card’s picks for a tournament, plus computed results (earnings, points, position, etc.).

### Golfers and tournament golfers

- `golfers`: the master record of a golfer (external API id, name, country, etc.)
- `tournamentGolfers`: golfer performance for a particular tournament (position, score, live fields)

### Money / ledger

- Table: `transactions`
- All financial movements (cents). Positive = credit, negative = debit.

### Notifications / audits

- `pushSubscriptions`: web push endpoints per member
- `auditLogs`: audit trail for changes

## Conventions

- Money amounts are stored as cents (`number`).
- Many tables have `updatedAt` (manual) plus Convex’s `_creationTime`.
- Prefer indexed access patterns; add indexes in `convex/schema.ts` when needed.

See also:

- [../backend/schema-and-indexes.md](../backend/schema-and-indexes.md)
- [../operations/migrations-and-imports.md](../operations/migrations-and-imports.md)
