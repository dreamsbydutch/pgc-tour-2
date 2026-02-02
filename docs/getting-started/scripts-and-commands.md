# Scripts and Commands

All scripts are defined in `package.json`.

## Core

- Dev server: `npm run dev`
- Build: `npm run build`
- Start production server: `npm run start`
- Preview build: `npm run serve`

## Code quality

- Typecheck: `npm run typecheck`
- Test: `npm run test`
- Lint: `npm run lint`
- Lint (strict): `npm run lint:strict`
- Format: `npm run format`

## Convex

- Run Convex locally: `npm run convex:dev`
- Deploy Convex: `npm run convex:deploy`

## Vercel note

After `npm run build`, this repo runs a post-build patch step:

- `postbuild`: `node scripts/patch-vercel-function-runtime.mjs`

If you change build outputs or Vercel configuration, keep an eye on this script.
