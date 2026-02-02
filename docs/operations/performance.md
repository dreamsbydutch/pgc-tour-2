# Performance Notes

## Convex query performance

- Prefer `.withIndex(...)` for common patterns.
- Avoid unbounded `.collect()` on large tables.
- Add schema indexes for new hot paths.

## Client round trips

- Prefer a small number of reusable “hot screen” convenience queries rather than N+1 client queries.
- Keep route files thin and avoid mixing routing with heavy data composition.

## Live tournament sync

The live sync job runs frequently.

- Keep its queries indexed.
- Keep writes minimal and self-gated.

See also:

- [../backend/cron-and-jobs.md](../backend/cron-and-jobs.md)
- [../backend/schema-and-indexes.md](../backend/schema-and-indexes.md)
