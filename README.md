# PGC Tour

PGC Tour is a mobile-first fantasy golf PWA for a private friends-and-family league. Members register for seasonal tours, submit a new 10-golfer roster for each event, follow live PGC and PGA leaderboards, compete through the playoffs, and settle season earnings. Organizers use authenticated workflows for fields, synchronization, standings, messaging, finance, and recovery.

The application uses TanStack Start, React, Convex, Clerk, Tailwind CSS, DataGolf, ESPN scorecards, Brevo, web push, PostHog, and Vercel.

## Documentation

The [PGC wiki](docs/README.md) is the entry point for product intent, league behavior, system architecture, operations, code maps, and known gaps. Start with:

- [Product and end goal](docs/PRODUCT.md)
- [League and app guide](docs/LEAGUE_AND_APP_GUIDE.md)
- [Application architecture](docs/APP_ARCHITECTURE.md)
- [Development and operations](docs/DEVELOPMENT_AND_OPERATIONS.md)
- [Repository agent guide](AGENTS.md)

## Local development

Use Node 22 (`.nvmrc` pins 22.23.1), npm, and a development Convex deployment.

```powershell
npm ci
npx convex dev --configure
```

Run the web and Convex processes in separate terminals:

```powershell
npm run dev
npm run convex:dev
```

The web app is available at `http://localhost:3000`. The dev script binds with `--host`, so use it only on a trusted network.

## Verification

Use focused checks while iterating. Before a release or broad change, run:

```powershell
npm run check
```

`package.json` is the command source of truth; the [command reference](docs/reference/COMMANDS.md) explains prerequisites and outputs.
