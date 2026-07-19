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
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\b(jr|sr|ii|iii|iv|v)\b$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findEspnGolferMatch(args: {
  espnAthleteId: string;
  playerName: string;
  localGolfers: Array<{ golferId: string; playerName: string }>;
  mappings: Array<{ golferId: string; espnAthleteId: string }>;
}): { golferId: string; matchMethod: "saved" | "exact_name" } | null {
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

  const normalizedName = normalizeEspnIdentityName(args.playerName);
  const exactMatches = args.localGolfers.filter(
    (golfer) => normalizeEspnIdentityName(golfer.playerName) === normalizedName,
  );
  if (exactMatches.length !== 1) return null;
  const golferId = exactMatches[0]?.golferId;
  if (!golferId) return null;
  const conflictingMapping = args.mappings.some(
    (mapping) =>
      mapping.golferId === golferId &&
      mapping.espnAthleteId !== args.espnAthleteId,
  );
  return conflictingMapping ? null : { golferId, matchMethod: "exact_name" };
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
  const compatible = events
    .map((event) => ({
      event,
      match: checkCompatabilityOfEventNames(tournamentName, event.eventName),
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
