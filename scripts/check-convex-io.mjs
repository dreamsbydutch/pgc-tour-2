import { readFile } from "node:fs/promises";

const boundedFunctions = [
  ["convex/functions/readModels.ts", "getViewerBootstrap"],
  ["convex/functions/home.ts", "getPublicHomeDashboard"],
  ["convex/functions/seasons.ts", "getStandingsIndex"],
  ["convex/functions/seasons.ts", "getTourCardTournamentHistory"],
  ["convex/functions/seasons.ts", "getRulebookView"],
  ["convex/functions/tournaments.ts", "getTournamentLeaderboardView"],
];

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
}

if (violations.length > 0) {
  throw new Error(`Convex I/O guard failed:\n${violations.join("\n")}`);
}

console.log(
  `Convex I/O guard passed for ${boundedFunctions.length} hot-path queries.`,
);
