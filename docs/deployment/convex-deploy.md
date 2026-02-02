# Convex Deploy

Convex is deployed separately from the frontend.

## Dev

Run Convex locally:

```bash
npm run convex:dev
```

If you need initial configuration:

```bash
npx convex dev --configure
```

## Deploy

Deploy Convex functions:

```bash
npm run convex:deploy
```

## Generated files

Convex generates types under `convex/_generated/*`.

- Do not hand-edit.
- If API paths or types look stale, rerun `convex dev`.

## Environment variables

Convex-specific secrets (e.g. `DATAGOLF_API_KEY`) should be set in the Convex dashboard.

See also:

- [environments.md](environments.md)
- [../backend/external-integrations.md](../backend/external-integrations.md)
