# PGC Documentation

This folder is the canonical, maintained documentation for the PGC full-stack app (TanStack Start + TanStack Router + Convex).

## Start here

- Getting set up locally: [getting-started/local-development.md](getting-started/local-development.md)
- Environment variables: [getting-started/environment-variables.md](getting-started/environment-variables.md)
- Common scripts/commands: [getting-started/scripts-and-commands.md](getting-started/scripts-and-commands.md)

## Architecture

- High-level overview: [architecture/overview.md](architecture/overview.md)
- Routing & rendering model: [architecture/routing-and-rendering.md](architecture/routing-and-rendering.md)
- Data model (Convex tables + concepts): [architecture/data-model.md](architecture/data-model.md)

## Frontend (TanStack Start)

- Component taxonomy + import rules: [frontend/component-taxonomy.md](frontend/component-taxonomy.md)
- Routing conventions (`src/routes/*`): [frontend/routing-conventions.md](frontend/routing-conventions.md)
- Data & state (Convex hooks, view models): [frontend/data-and-state.md](frontend/data-and-state.md)
- Styling & UI primitives (Tailwind + shadcn/ui): [frontend/styling-and-ui.md](frontend/styling-and-ui.md)
- Frontend testing (Vitest): [frontend/testing.md](frontend/testing.md)

## Backend (Convex)

- Convex overview in this repo: [backend/convex-overview.md](backend/convex-overview.md)
- Function modules and API paths: [backend/functions-and-modules.md](backend/functions-and-modules.md)
- Schema, validators, and indexes: [backend/schema-and-indexes.md](backend/schema-and-indexes.md)
- Auth and identity (Clerk + current conventions): [backend/auth-and-identity.md](backend/auth-and-identity.md)
- Cron jobs and scheduled work: [backend/cron-and-jobs.md](backend/cron-and-jobs.md)
- External integrations (DataGolf, email, analytics): [backend/external-integrations.md](backend/external-integrations.md)

## Deployment

- Deploying frontend on Vercel: [deployment/vercel.md](deployment/vercel.md)
- Deploying Convex: [deployment/convex-deploy.md](deployment/convex-deploy.md)
- Environments (dev/stage/prod): [deployment/environments.md](deployment/environments.md)

## Operations

- Troubleshooting playbook: [operations/troubleshooting.md](operations/troubleshooting.md)
- Migrations/import flows: [operations/migrations-and-imports.md](operations/migrations-and-imports.md)
- Performance notes: [operations/performance.md](operations/performance.md)
- Security notes (non-breaking): [operations/security-notes.md](operations/security-notes.md)

## Decisions

- Decision log: [decisions/README.md](decisions/README.md)
- ADR template: [decisions/adr-template.md](decisions/adr-template.md)
