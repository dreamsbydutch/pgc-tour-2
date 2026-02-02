# Schema, Validators, and Indexes

The schema is defined in `convex/schema.ts`.

## What’s in the schema

The schema defines:

- table definitions (field validators via `v.*`)
- indexes for common access patterns

This repo’s schema includes tables for:

- members/auth mapping
- seasons/tours/tiers/tournaments
- tour cards, teams, golfers, tournament golfers
- transactions (ledger)
- push subscriptions and audit logs

## Index usage

Prefer:

- `.withIndex("index_name", (q) => q.eq("field", value))`

Avoid:

- `.filter(...)` for common access patterns when an index would work

When adding a new common query pattern:

1. Add an index in `convex/schema.ts`.
2. Use `.withIndex(...)` in your query.

## Validation

Function args should be validated using `v` validators.

- Centralize validators under `convex/validators/*`.
- Prefer reuse across functions in the same domain.

## Money convention

- Store money as cents (`number`).
- Format on the client (or via shared server helper) when needed.

See also:

- [../architecture/data-model.md](../architecture/data-model.md)
- [functions-and-modules.md](functions-and-modules.md)
