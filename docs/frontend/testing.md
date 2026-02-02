# Frontend Testing

This repo uses Vitest.

## Run tests

```bash
npm run test
```

## What to test

Prefer testing:

- hooks and pure helpers in `src/lib/*`
- display components (rendering/props) with Testing Library

Avoid brittle tests that depend heavily on implementation details.

## Notes

- This repo is TypeScript `strict`.
- Keep tests aligned with the component taxonomy: don’t introduce Convex logic into UI primitives just for tests.
