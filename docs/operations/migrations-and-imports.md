# Migrations and Imports

This repo contains patterns for importing/migrating legacy data.

## General guidance

- Preserve legacy identifiers using `oldId` fields where present.
- Prefer upsert-by-`oldId` patterns: if a record exists, patch it; otherwise insert.
- When doing bulk work, prefer server-side batch processing utilities.

## Where migration-related logic usually lives

- Convex function modules for the entity being migrated
- Shared helpers in `convex/utils/*`

## Safety

- Avoid adding breaking auth changes while doing migrations.
- Validate inputs and keep writes idempotent where possible.

## Recommended workflow

1. Add or reuse `oldId` mapping.
2. Build a migration function (often internal-only).
3. Run on a dev deployment first.
4. Validate counts and spot-check data.

See also:

- [../backend/schema-and-indexes.md](../backend/schema-and-indexes.md)
- [troubleshooting.md](troubleshooting.md)
