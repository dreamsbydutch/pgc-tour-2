# PGC Tour

PGC is a season-long fantasy golf application built with TanStack Start,
React, Convex, Clerk, and Tailwind CSS.

## Documentation

The maintained project and league documentation lives in
[docs/README.md](docs/README.md):

- [App architecture](docs/APP_ARCHITECTURE.md)
- [League and app guide](docs/LEAGUE_AND_APP_GUIDE.md)
- [Development and operations](docs/DEVELOPMENT_AND_OPERATIONS.md)

League-affecting work must start with the league and app guide. Code-placement
rules are also enforced by [AGENTS.md](AGENTS.md).

## Quick start

Node.js 20.19 or newer within Node 20, plus access to the project's Convex and
Clerk configuration, are required. The repository pins Node 20.19.5 in
`.nvmrc` and CI.

```bash
npm install
npx convex dev --configure
```

Run the frontend and backend development processes in separate terminals:

```bash
npm run dev
npm run convex:dev
```

The app runs at `http://localhost:3000`.

## Verification

Run the complete local quality gate before release:

```bash
npm run check
```

`package.json` is the authoritative list of available commands.
