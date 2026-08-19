# Application Architecture

PGC is a TanStack Start/React application backed by Convex, authenticated by Clerk, and deployed as two compatible systems: a Vercel web/SSR artifact and a Convex backend. This hub captures the durable system shape; follow its detailed pages for placement and boundary rules.

## System flow

```text
browser / installed PWA
  -> TanStack route and providers
  -> page/facilitator + presentation components
  -> frontend hook and UI-ready state
  -> typed Convex public query/mutation/action
  -> authenticated/indexed Convex data or internal workflow
  -> DataGolf / ESPN / Brevo / Web Push when external work is required
```

Live queries push bounded screen data back to hooks. Mutations transact authoritative writes. Actions call external services. Internal scheduled workflows coordinate leases, retries, persistence, and downstream refreshes.

## Runtime and deployment split

```text
src/ + public/ + Vite/Nitro
  -> .output/ and optional .vercel/output/
  -> Vercel web + SSR runtime

convex/schema.ts + convex/functions|utils|types|validators + convex/crons.ts
  -> Convex deployment
  -> database, functions, scheduler, live queries
```

The client and backend can deploy independently, so compatible schema/function changes land before a dependent client. Generated route and Convex API files are committed but owned by their generators. See [repository map](reference/REPOSITORY_MAP.md) and [deployment](operations/DEPLOYMENT.md).

## Durable boundaries

- Frontend dependencies flow routes -> components -> hooks -> utilities, with app-owned shared shapes in `src/types/`.
- Convex queries read, mutations transact, and actions perform external/nondeterministic work. Scheduled and implementation-level operations stay internal.
- Sensitive identity and role decisions come from `ctx.auth` and the member record, never client arguments.
- Public, viewer, and admin responses are explicit bounded DTOs. Detail is loaded on demand rather than subscribed everywhere.
- Canonical writes own their downstream cascade. Read models accelerate screens but do not replace the authoritative domain record.
- DataGolf owns authoritative provider tournament totals; ESPN adds best-effort hole cells; PGC owns grouping, rosters, scoring, awards, standings, money, and member communication.
- Time, score, identity, and money units must be explicit at every boundary.

## Detailed pages

- [Frontend architecture](architecture/FRONTEND.md)
- [Backend architecture](architecture/BACKEND.md)
- [Data model and indexes](architecture/DATA_MODEL.md)
- [External integrations](architecture/INTEGRATIONS.md)
- [Repository and deployment map](reference/REPOSITORY_MAP.md)
- [Domain-to-code map](reference/CODE_MAP.md)
- [Known architectural gaps](KNOWN_GAPS.md#architecture-and-operations)

Implementation placement rules remain enforceable in `AGENTS.md` and `eslint.config.js`; this wiki explains their intent and exceptions.
