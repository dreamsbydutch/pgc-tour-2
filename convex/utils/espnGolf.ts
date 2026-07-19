import type {
  EspnGolfEvent,
  EspnHoleScore,
  EspnPlayerScorecard,
  EspnRoundScore,
} from "../types/espnGolf";
import { checkCompatabilityOfEventNames } from "./datagolf";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseRelativeToPar(value: unknown): number | undefined {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  if (raw === "E" || raw === "EVEN") return 0;
  if (!/^[+-]?\d+$/.test(raw)) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function normalizeEspnIdentityName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(junior)\b/g, "jr")
    .replace(/\b(senior)\b/g, "sr")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const GIVEN_NAME_ALIASES = [
  ["ben", "benjamin"],
  ["bill", "billy", "will", "william"],
  ["bob", "bobby", "rob", "robert"],
  ["cam", "cameron"],
  ["chris", "christopher"],
  ["dan", "daniel"],
  ["dave", "david"],
  ["joe", "joseph"],
  ["jon", "jonathan"],
  ["matt", "matthew"],
  ["nick", "nicholas"],
  ["pat", "patrick"],
  ["sam", "samuel"],
  ["steve", "stephen", "steven"],
  ["joohyung", "tom", "thomas"],
  ["tony", "anthony"],
] as const;

const GIVEN_NAME_CANONICAL = new Map<string, string>(
  GIVEN_NAME_ALIASES.flatMap((group) =>
    group.map((name) => [name, group[0]] as const),
  ),
);

type ParsedIdentityName = {
  normalized: string;
  orderedTokens: string[];
  givenTokens: string[];
  surnameTokens: string[];
};

function parseIdentityName(name: string): ParsedIdentityName | null {
  const normalized = normalizeEspnIdentityName(name);
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length < 2) return null;
  const commaReversed = /,/.test(name);
  const ordered = commaReversed ? [...tokens].reverse() : tokens;
  return {
    normalized,
    orderedTokens: ordered,
    givenTokens: ordered.slice(0, -1),
    surnameTokens: ordered.slice(-1),
  };
}

function canonicalGivenName(value: string): string {
  return GIVEN_NAME_CANONICAL.get(value) ?? value;
}

function givenNamesAreCompatible(a: string[], b: string[]): boolean {
  const aJoined = a.join("");
  const bJoined = b.join("");
  if (!aJoined || !bJoined) return false;
  if (aJoined === bJoined) return true;
  if (canonicalGivenName(a[0] ?? "") === canonicalGivenName(b[0] ?? "")) {
    return true;
  }

  const aInitials = a.map((token) => token[0]).join("");
  const bInitials = b.map((token) => token[0]).join("");
  return (
    (aJoined.length <= 3 && aJoined === bInitials) ||
    (bJoined.length <= 3 && bJoined === aInitials) ||
    (aJoined.length === 1 && bJoined.startsWith(aJoined)) ||
    (bJoined.length === 1 && aJoined.startsWith(bJoined))
  );
}

function scoreIdentityNameMatch(espnName: string, localName: string): number {
  const espn = parseIdentityName(espnName);
  const local = parseIdentityName(localName);
  if (!espn || !local) return 0;
  if (espn.normalized === local.normalized) return 100;

  const sameSurname =
    espn.surnameTokens.join("") === local.surnameTokens.join("");
  const compatibleGiven = givenNamesAreCompatible(
    espn.givenTokens,
    local.givenTokens,
  );
  if (sameSurname && compatibleGiven) {
    const exactGiven = espn.givenTokens.join("") === local.givenTokens.join("");
    return exactGiven ? 90 : 80;
  }

  // Some feeds omit one part of a compound family name. Only accept this when
  // the full given name (or a known nickname) agrees and a substantial family
  // token is shared; initials alone are intentionally not enough here.
  const firstNamesAgree =
    canonicalGivenName(espn.orderedTokens[0] ?? "") ===
    canonicalGivenName(local.orderedTokens[0] ?? "");
  const espnFamilyTokens = new Set(
    espn.orderedTokens.slice(1).filter((token) => token.length >= 3),
  );
  const sharedFamilyToken = local.orderedTokens
    .slice(1)
    .some((token) => token.length >= 3 && espnFamilyTokens.has(token));
  const espnFamilyCompact = espn.orderedTokens.slice(1).join("");
  const localFamilyCompact = local.orderedTokens.slice(1).join("");
  const compatibleFamilyCompact =
    espnFamilyCompact.length >= 4 &&
    localFamilyCompact.length >= 4 &&
    (espnFamilyCompact.includes(localFamilyCompact) ||
      localFamilyCompact.includes(espnFamilyCompact));
  return firstNamesAgree && (sharedFamilyToken || compatibleFamilyCompact)
    ? 75
    : 0;
}

export function findEspnGolferMatch(args: {
  espnAthleteId: string;
  playerName: string;
  localGolfers: Array<{ golferId: string; playerName: string }>;
  mappings: Array<{ golferId: string; espnAthleteId: string }>;
}): {
  golferId: string;
  matchMethod: "saved" | "exact_name" | "name_variant";
} | null {
  const saved = args.mappings.find(
    (mapping) => mapping.espnAthleteId === args.espnAthleteId,
  );
  if (saved) {
    return args.localGolfers.some(
      (golfer) => golfer.golferId === saved.golferId,
    )
      ? { golferId: saved.golferId, matchMethod: "saved" }
      : null;
  }

  const candidates = args.localGolfers
    .map((golfer) => ({
      golfer,
      score: scoreIdentityNameMatch(args.playerName, golfer.playerName),
    }))
    .filter((candidate) => candidate.score >= 75)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (!best || candidates[1]?.score === best.score) return null;
  const golferId = best.golfer.golferId;
  if (!golferId) return null;
  const conflictingMapping = args.mappings.some(
    (mapping) =>
      mapping.golferId === golferId &&
      mapping.espnAthleteId !== args.espnAthleteId,
  );
  return conflictingMapping
    ? null
    : {
        golferId,
        matchMethod: best.score === 100 ? "exact_name" : "name_variant",
      };
}

function parseHole(value: unknown): EspnHoleScore | null {
  const record = asRecord(value);
  if (!record) return null;
  const hole = finiteNumber(record.period);
  const strokes = finiteNumber(record.value);
  const scoreType = asRecord(record.scoreType);
  const relativeToPar = parseRelativeToPar(scoreType?.displayValue);
  if (
    hole === undefined ||
    strokes === undefined ||
    relativeToPar === undefined ||
    !Number.isInteger(hole) ||
    hole < 1 ||
    hole > 18 ||
    strokes < 1
  ) {
    return null;
  }
  return { hole, strokes, relativeToPar };
}

function parseRound(value: unknown): EspnRoundScore | null {
  const record = asRecord(value);
  if (!record) return null;
  const round = finiteNumber(record.period);
  if (
    round === undefined ||
    !Number.isInteger(round) ||
    round < 1 ||
    round > 4
  ) {
    return null;
  }
  const holes = Array.isArray(record.linescores)
    ? record.linescores
        .map(parseHole)
        .filter((hole): hole is EspnHoleScore => hole !== null)
        .sort((a, b) => a.hole - b.hole)
    : [];
  const totalStrokes = finiteNumber(record.value);
  return {
    round,
    ...(totalStrokes !== undefined ? { totalStrokes } : {}),
    holes,
  };
}

function parsePlayer(value: unknown): EspnPlayerScorecard | null {
  const record = asRecord(value);
  if (!record) return null;
  const athlete = asRecord(record.athlete);
  const espnAthleteId = String(athlete?.id ?? record.id ?? "").trim();
  const playerName = String(
    athlete?.displayName ?? athlete?.fullName ?? "",
  ).trim();
  if (!espnAthleteId || !playerName) return null;
  const rounds = Array.isArray(record.linescores)
    ? record.linescores
        .map(parseRound)
        .filter((round): round is EspnRoundScore => round !== null)
        .sort((a, b) => a.round - b.round)
    : [];
  return { espnAthleteId, playerName, rounds };
}

export function parseEspnGolfScoreboard(payload: unknown): EspnGolfEvent[] {
  const root = asRecord(payload);
  if (!root || !Array.isArray(root.events)) return [];

  return root.events.flatMap((rawEvent): EspnGolfEvent[] => {
    const event = asRecord(rawEvent);
    if (!event) return [];
    const espnEventId = String(event.id ?? "").trim();
    const eventName = String(event.name ?? event.shortName ?? "").trim();
    const competitions = Array.isArray(event.competitions)
      ? event.competitions
      : [];
    const competition = asRecord(competitions[0]);
    if (!espnEventId || !eventName || !competition) return [];
    const players = Array.isArray(competition.competitors)
      ? competition.competitors
          .map(parsePlayer)
          .filter((player): player is EspnPlayerScorecard => player !== null)
      : [];
    return [
      {
        espnEventId,
        eventName,
        startDate: typeof event.date === "string" ? event.date : undefined,
        endDate: typeof event.endDate === "string" ? event.endDate : undefined,
        players,
      },
    ];
  });
}

export function selectEspnGolfEvent(
  events: EspnGolfEvent[],
  tournamentName: string,
): EspnGolfEvent | null {
  const normalizedTournamentName = normalizeEspnIdentityName(tournamentName);
  const compatible = events
    .map((event) => ({
      event,
      match: checkCompatabilityOfEventNames(
        normalizedTournamentName,
        normalizeEspnIdentityName(event.eventName),
      ),
    }))
    .filter(({ match }) => match.ok)
    .sort((a, b) => b.match.score - a.match.score);

  if (compatible.length === 0) return null;
  if (
    compatible.length > 1 &&
    compatible[0]?.match.score === compatible[1]?.match.score
  ) {
    return null;
  }
  return compatible[0]?.event ?? null;
}

export function mergeEspnRounds(
  existing: EspnRoundScore[],
  incoming: EspnRoundScore[],
): EspnRoundScore[] {
  const rounds = new Map<number, EspnRoundScore>();
  for (const round of existing) {
    rounds.set(round.round, {
      ...round,
      holes: [...round.holes].sort((a, b) => a.hole - b.hole),
    });
  }
  for (const round of incoming) {
    const previous = rounds.get(round.round);
    const holes = new Map<number, EspnHoleScore>(
      previous?.holes.map((hole) => [hole.hole, hole]) ?? [],
    );
    for (const hole of round.holes) holes.set(hole.hole, hole);
    rounds.set(round.round, {
      round: round.round,
      ...(round.totalStrokes !== undefined
        ? { totalStrokes: round.totalStrokes }
        : previous?.totalStrokes !== undefined
          ? { totalStrokes: previous.totalStrokes }
          : {}),
      holes: [...holes.values()].sort((a, b) => a.hole - b.hole),
    });
  }
  return [...rounds.values()]
    .filter((round) => round.round >= 1 && round.round <= 4)
    .sort((a, b) => a.round - b.round);
}
