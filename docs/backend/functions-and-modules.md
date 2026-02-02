# Convex Functions and Modules

Convex functions live in `convex/functions/*`.

## Module naming

- Each file represents a domain module (members, seasons, tournaments, etc.).
- Exports are referenced from the frontend using the generated API.

Example import (frontend):

```ts
import { api, useQuery } from "@/convex";

const members = useQuery(api.functions.members.listMembers, {});
```

## CRUD convention (project pattern)

Many modules follow a consistent shape:

- `createXxx` (mutation)
- `getXxx` (query)
- `updateXxx` (mutation)
- `deleteXxx` (mutation)

Common argument shape:

- `args.data` contains the payload
- `args.options` controls behavior (`returnEnhanced`, `skipValidation`, etc.)

If you add a new entity/module, prefer matching this pattern unless there is a strong reason not to.

## Internal vs public

- Public functions are called by the client.
- Internal functions are only callable by other Convex functions and cron jobs.

This repo uses cron jobs that call internal functions via `internal.functions.<module>.<fn>`.

## Utilities and validators

- Put reusable server helpers in `convex/utils/*`.
- Keep input validation centralized under `convex/validators/*`.

## Regeneration

If you add/remove exports or change schema:

- Run `npm run convex:dev` (or `npx convex dev`) to regenerate `convex/_generated/*`.

Do not hand-edit generated files.
