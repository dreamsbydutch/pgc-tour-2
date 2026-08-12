# PGC Documentation

This folder is the maintained operating manual for the PGC Tour application and
league. It is intentionally small: durable rules belong here; temporary
investigations, release notes, and one-off implementation details do not.

## The documentation set

- [APP_ARCHITECTURE.md](APP_ARCHITECTURE.md) — system boundaries, repository
  structure, data model, and engineering rules.
- [LEAGUE_AND_APP_GUIDE.md](LEAGUE_AND_APP_GUIDE.md) — league rules and the
  end-to-end workflow the app must preserve.
- [DEVELOPMENT_AND_OPERATIONS.md](DEVELOPMENT_AND_OPERATIONS.md) — local setup,
  configuration, testing, deployment, maintenance, and incident checks.

## Which source wins?

Different sources answer different questions:

| Question                        | Source of truth                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------- |
| What the league intends         | The in-app rulebook in `src/utils/rules.ts`, confirmed by league organizers      |
| What the app currently enforces | Convex functions, utilities, schema, and tests                                   |
| How code should be organized    | `AGENTS.md`, summarized in `APP_ARCHITECTURE.md`                                 |
| What data is persisted          | `convex/schema.ts`                                                               |
| What commands exist             | `package.json`                                                                   |
| What jobs run automatically     | `convex/crons.ts` and scheduled work created by `convex/functions/readModels.ts` |

If league intent and backend behavior disagree, do not silently choose one.
Document the gap, confirm the intended rule, then update the rulebook, backend,
tests, and this guide together.

## Documentation standard

- Update an existing document instead of creating a new file when the subject
  already fits one of the three guides.
- Document invariants, ownership, workflows, and recovery steps—not every
  function or component.
- Link to authoritative code rather than duplicating implementation details
  that are likely to drift.
- Keep secrets, real credentials, member data, and exported production data out
  of documentation.
- Remove obsolete guidance as part of the change that makes it obsolete.
