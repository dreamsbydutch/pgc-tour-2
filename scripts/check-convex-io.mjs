import { readFile, readdir } from "node:fs/promises";

const boundedFunctions = [
  ["convex/functions/readModels.ts", "getViewerBootstrap"],
  ["convex/functions/home.ts", "getPublicHomeDashboard"],
  ["convex/functions/seasons.ts", "getStandingsIndex"],
  ["convex/functions/seasons.ts", "getTourCardTournamentHistory"],
  ["convex/functions/seasons.ts", "getRulebookView"],
  ["convex/functions/tournaments.ts", "getTournamentLeaderboardView"],
  ["convex/functions/tournaments.ts", "getTournamentShell"],
  ["convex/functions/tournaments.ts", "getPgcLeaderboard"],
  ["convex/functions/tournaments.ts", "getPgaLeaderboard"],
  ["convex/functions/tournaments.ts", "getTeamDetail"],
  ["convex/functions/espnGolf.ts", "getPlayerHoleScorecard"],
  ["convex/functions/espnGolf.ts", "getTeamHoleScorecards"],
];

const sensitivePublicFields = [
  "clerkId",
  "payoutEmail",
  "espnId",
  "espnRounds",
  "espnScorecardUpdatedAt",
  "dataGolfInPlayLastUpdate",
  "liveSyncChainId",
  "liveSyncLeaseUntil",
  "liveSyncScheduledTournamentId",
  "groupsEmailSentAt",
  "reminderEmailSentAt",
  "pickWindowScheduledTournamentId",
];

const representativeFixtures = {
  getViewerBootstrap: {
    budget: 32 * 1024,
    value: {
      appState: {
        currentSeasonId: "season",
        activeTournamentId: "tournament",
        seasonPhase: "in-season",
        publicVersion: 1,
      },
      member: {
        _id: "member",
        email: "viewer@example.com",
        firstname: "Viewer",
        lastname: "Member",
        role: "regular",
        account: 0,
        friends: Array.from({ length: 100 }, (_, index) => `friend-${index}`),
        isActive: true,
      },
      tourCards: [],
      badges: [],
      tourCardSelfService: { closesAt: null },
    },
  },
  getStandingsIndex: {
    budget: 250 * 1024,
    value: {
      seasons: Array.from({ length: 10 }, (_, index) => ({
        _id: `season-${index}`,
        year: 2026 - index,
        number: 1,
      })),
      tours: Array.from({ length: 5 }, (_, index) => ({
        _id: `tour-${index}`,
        name: `Tour ${index}`,
        shortForm: `T${index}`,
        logoUrl: "https://example.com/tour.png",
        playoffSpots: [25, 25],
      })),
      standingsRows: Array.from({ length: 500 }, (_, index) => ({
        _id: `card-${index}`,
        seasonId: "season-0",
        tourId: `tour-${index % 5}`,
        memberId: `member-${index}`,
        displayName: `Representative Player ${index}`,
        points: index,
        earnings: index * 100,
        wins: 0,
        topFive: 0,
        topTen: 0,
        madeCut: 10,
        appearances: 12,
        pastPoints: index,
        currentPosition: String(index + 1),
        playoff: 0,
        posChange: 0,
        posChangePO: 0,
      })),
      majorChampionBadgesByMemberId: {},
    },
  },
  getTournamentShell: {
    budget: 160 * 1024,
    value: {
      tournament: { _id: "tournament", name: "Tournament" },
      allTournaments: Array.from({ length: 100 }, (_, index) => ({
        _id: `tournament-${index}`,
        name: `Tournament ${index}`,
        startDate: index,
        endDate: index + 1,
        status: "completed",
      })),
      tours: [],
      majorChampionBadgesByMemberId: {},
    },
  },
  getPgcLeaderboard: {
    budget: 512 * 1024,
    value: {
      teams: Array.from({ length: 500 }, (_, index) => ({
        _id: `team-${index}`,
        tournamentId: "tournament",
        tourCardId: `card-${index}`,
        displayName: `Player ${index}`,
        points: index,
        position: String(index + 1),
      })),
      tourCards: [],
    },
  },
  getTourCardTournamentHistory: {
    budget: 128 * 1024,
    value: {
      page: Array.from({ length: 50 }, (_, index) => ({
        _id: `contribution-${index}`,
        tournamentId: `tournament-${index}`,
        position: String(index + 1),
        points: index,
        earnings: index * 100,
        tournament: { name: `Tournament ${index}` },
      })),
      isDone: false,
      continueCursor: "cursor",
      tournaments: Array.from({ length: 20 }, (_, index) => ({
        _id: `tournament-${index}`,
        name: `Tournament ${index}`,
        logoUrl: "https://example.com/tournament.png",
        startDate: index,
        endDate: index + 1,
        tierId: "tier",
        status: "completed",
        tierName: "Standard",
        isPlayoff: false,
      })),
    },
  },
};

const violations = [];
for (const [file, name] of boundedFunctions) {
  const source = await readFile(file, "utf8");
  const start = source.indexOf(`export const ${name} =`);
  if (start < 0) {
    violations.push(`${file}: missing ${name}`);
    continue;
  }
  const next = source.indexOf("\nexport const ", start + 1);
  const body = source.slice(start, next < 0 ? source.length : next);
  if (body.includes(".collect()")) {
    violations.push(`${file}:${name} contains an unbounded .collect()`);
  }
  if (
    /\.\.\.(?:tournament|team|member|season|course|tier|golfer|card|state|transaction|item)\b/.test(
      body,
    )
  ) {
    violations.push(`${file}:${name} contains a raw document spread`);
  }
}

for (const entry of await readdir("convex/functions")) {
  if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
  const file = `convex/functions/${entry}`;
  const source = await readFile(file, "utf8");
  const publicFunctionPattern =
    /export const ([A-Za-z0-9_]+)(?::[^=]+)?=\s*(query|mutation|action)\s*\(\s*\{/g;
  for (const match of source.matchAll(publicFunctionPattern)) {
    const start = match.index ?? 0;
    const next = source.indexOf("\nexport const ", start + 1);
    const body = source.slice(start, next < 0 ? source.length : next);
    if (match[2] === "query" && body.includes(".collect()")) {
      violations.push(`${file}:${match[1]} contains an unbounded .collect()`);
    }
    if (
      /\.\.\.(?:tournament|team|member|season|course|tier|golfer|card|state|transaction|item)\b/.test(
        body,
      )
    ) {
      violations.push(`${file}:${match[1]} contains a raw document spread`);
    }
  }
}

const projectorSource = await readFile("convex/utils/publicDtos.ts", "utf8");
if (/\.\.\.[A-Za-z_$]/.test(projectorSource)) {
  violations.push("convex/utils/publicDtos.ts contains a raw object spread");
}
for (const field of sensitivePublicFields) {
  if (new RegExp(`\\b${field}\\b`).test(projectorSource)) {
    violations.push(
      `convex/utils/publicDtos.ts projects sensitive field ${field}`,
    );
  }
}

for (const [name, fixture] of Object.entries(representativeFixtures)) {
  const serialized = JSON.stringify(fixture.value);
  const bytes = Buffer.byteLength(serialized, "utf8");
  if (bytes > fixture.budget) {
    violations.push(
      `${name} representative response is ${bytes} bytes; budget is ${fixture.budget}`,
    );
  }
  for (const field of sensitivePublicFields) {
    if (new RegExp(`"${field}"\\s*:`).test(serialized)) {
      violations.push(`${name} representative response exposes ${field}`);
    }
  }
}

if (violations.length > 0) {
  throw new Error(`Convex I/O guard failed:\n${violations.join("\n")}`);
}

console.log(
  `Convex I/O guard passed for ${boundedFunctions.length} hot-path queries and ${Object.keys(representativeFixtures).length} serialized fixtures.`,
);
