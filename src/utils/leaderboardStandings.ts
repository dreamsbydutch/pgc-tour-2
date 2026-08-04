import type {
  BuildLeaderboardStandingsProjectionArgs,
  LeaderboardStandingsSnapshot,
  PlayoffDestination,
  PlayoffStartingStrokeCard,
  StandingsProjectionTourCard,
  StandingsSnapshotValue,
} from "@/types";

type CompetitionRank = {
  position: string;
  betterCount: number;
};

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatStandingsPosition(rank: number, tied = false): string {
  const lastTwoDigits = rank % 100;
  const suffix =
    lastTwoDigits >= 11 && lastTwoDigits <= 13
      ? "th"
      : rank % 10 === 1
        ? "st"
        : rank % 10 === 2
          ? "nd"
          : rank % 10 === 3
            ? "rd"
            : "th";
  return `${tied ? "T" : ""}${rank}${suffix}`;
}

export function buildCompetitionRanks(
  cards: StandingsProjectionTourCard[],
): Map<string, CompetitionRank> {
  const rankById = new Map<string, CompetitionRank>();
  const pointCounts = new Map<number, number>();

  for (const card of cards) {
    pointCounts.set(card.points, (pointCounts.get(card.points) ?? 0) + 1);
  }

  const pointValues = [...pointCounts.keys()].sort((a, b) => b - a);
  let betterCount = 0;

  for (const points of pointValues) {
    const tiedCount = pointCounts.get(points) ?? 0;
    const position = formatStandingsPosition(betterCount + 1, tiedCount > 1);
    for (const card of cards) {
      if (card.points === points) {
        rankById.set(card.id, { position, betterCount });
      }
    }
    betterCount += tiedCount;
  }

  return rankById;
}

export function getPlayoffDestination(args: {
  betterCount: number;
  playoffSpots: readonly number[];
}): PlayoffDestination {
  const goldSpots = Math.max(0, args.playoffSpots[0] ?? 0);
  const silverSpots = Math.max(0, args.playoffSpots[1] ?? 0);

  if (args.betterCount < goldSpots) return "gold";
  if (args.betterCount < goldSpots + silverSpots) return "silver";
  return "out";
}

export function buildPlayoffStartingStrokes(
  cards: PlayoffStartingStrokeCard[],
  destination: Exclude<PlayoffDestination, "out">,
): Map<string, number> {
  const strokesById = new Map<string, number>();
  if (cards.length === 0) return strokesById;

  const sorted = cards.slice().sort((a, b) => {
    const pointsDelta = b.points - a.points;
    return pointsDelta !== 0 ? pointsDelta : a.id.localeCompare(b.id);
  });
  const baseStrokes: number[] = [];

  if (destination === "gold") {
    const highPoints = sorted[0]!.points;
    const lowPoints = sorted[sorted.length - 1]!.points;
    const denominator = highPoints - lowPoints;

    for (const card of sorted) {
      baseStrokes.push(
        Number.isFinite(denominator) && denominator > 0
          ? roundToOneDecimal(-10 * ((card.points - lowPoints) / denominator))
          : 0,
      );
    }
  } else {
    const floorIndex = Math.min(35, sorted.length - 1);
    const highPoints = sorted[0]!.points;
    const floorPoints = sorted[floorIndex]!.points;
    const denominator = highPoints - floorPoints;

    sorted.forEach((card, index) => {
      if (
        index >= floorIndex ||
        !Number.isFinite(denominator) ||
        denominator <= 0
      ) {
        baseStrokes.push(0);
        return;
      }
      baseStrokes.push(
        roundToOneDecimal(-10 * ((card.points - floorPoints) / denominator)),
      );
    });
  }

  for (let index = 0; index < sorted.length; ) {
    const points = sorted[index]!.points;
    let tieEnd = index + 1;
    while (tieEnd < sorted.length && sorted[tieEnd]!.points === points) {
      tieEnd += 1;
    }
    const occupiedStrokes = baseStrokes.slice(index, tieEnd);
    const tiedStroke = roundToOneDecimal(
      occupiedStrokes.reduce((sum, value) => sum + value, 0) /
        occupiedStrokes.length,
    );
    for (let tiedIndex = index; tiedIndex < tieEnd; tiedIndex += 1) {
      strokesById.set(sorted[tiedIndex]!.id, tiedStroke);
    }
    index = tieEnd;
  }

  return strokesById;
}

function buildSnapshotValues(args: {
  toursById: Map<string, readonly number[]>;
  cards: StandingsProjectionTourCard[];
}): Map<string, StandingsSnapshotValue> {
  const values = new Map<string, StandingsSnapshotValue>();
  const cardsByTour = new Map<string, StandingsProjectionTourCard[]>();

  for (const card of args.cards) {
    const tourCards = cardsByTour.get(card.tourId) ?? [];
    tourCards.push(card);
    cardsByTour.set(card.tourId, tourCards);
  }

  for (const [tourId, tourCards] of cardsByTour) {
    const ranks = buildCompetitionRanks(tourCards);
    const playoffSpots = args.toursById.get(tourId) ?? [];
    for (const card of tourCards) {
      const rank = ranks.get(card.id);
      if (!rank) continue;
      values.set(card.id, {
        position: rank.position,
        points: card.points,
        destination: getPlayoffDestination({
          betterCount: rank.betterCount,
          playoffSpots,
        }),
      });
    }
  }

  return values;
}

function buildSnapshotStartingStrokes(
  cards: StandingsProjectionTourCard[],
  values: Map<string, StandingsSnapshotValue>,
) {
  const goldCards: PlayoffStartingStrokeCard[] = [];
  const silverCards: PlayoffStartingStrokeCard[] = [];

  for (const card of cards) {
    const value = values.get(card.id);
    if (value?.destination === "gold") {
      goldCards.push({ id: card.id, points: card.points });
    } else if (value?.destination === "silver") {
      silverCards.push({ id: card.id, points: card.points });
    }
  }

  return {
    gold: buildPlayoffStartingStrokes(goldCards, "gold"),
    silver: buildPlayoffStartingStrokes(silverCards, "silver"),
  };
}

function getSnapshotStartingStrokes(
  cardId: string,
  value: StandingsSnapshotValue,
  strokes: ReturnType<typeof buildSnapshotStartingStrokes>,
): number | null {
  if (value.destination === "gold") {
    return strokes.gold.get(cardId) ?? null;
  }
  if (value.destination === "silver") {
    return strokes.silver.get(cardId) ?? null;
  }
  return null;
}

export function buildLeaderboardStandingsProjections(
  args: BuildLeaderboardStandingsProjectionArgs,
): Map<string, LeaderboardStandingsSnapshot> {
  const snapshots = new Map<string, LeaderboardStandingsSnapshot>();
  if (args.tournamentStatus !== "active" || args.isPlayoff) return snapshots;

  const toursById = new Map(
    args.tours.map((tour) => [tour.id, tour.playoffSpots] as const),
  );
  const officialValues = buildSnapshotValues({
    toursById,
    cards: args.tourCards,
  });
  const officialStrokes = buildSnapshotStartingStrokes(
    args.tourCards,
    officialValues,
  );
  const cardById = new Map(args.tourCards.map((card) => [card.id, card]));
  const teamByTourCardId = new Map(
    args.teams.map((team) => [team.tourCardId, team]),
  );
  const unavailableTourIds = new Set<string>();

  for (const team of args.teams) {
    const card = cardById.get(team.tourCardId);
    if (
      card &&
      (typeof team.points !== "number" || !Number.isFinite(team.points))
    ) {
      unavailableTourIds.add(card.tourId);
    }
  }

  const projectedCards = args.tourCards
    .filter((card) => !unavailableTourIds.has(card.tourId))
    .map((card) => ({
      ...card,
      points: card.points + (teamByTourCardId.get(card.id)?.points ?? 0),
    }));
  const projectedValues = buildSnapshotValues({
    toursById,
    cards: projectedCards,
  });
  const allToursAvailable = unavailableTourIds.size === 0;
  const projectedStrokes = allToursAvailable
    ? buildSnapshotStartingStrokes(projectedCards, projectedValues)
    : { gold: new Map<string, number>(), silver: new Map<string, number>() };

  for (const card of args.tourCards) {
    const beforeTournament = officialValues.get(card.id);
    if (!beforeTournament) continue;
    const projected = projectedValues.get(card.id);
    snapshots.set(card.id, {
      tourCardId: card.id,
      beforeTournament: {
        ...beforeTournament,
        startingStrokes: getSnapshotStartingStrokes(
          card.id,
          beforeTournament,
          officialStrokes,
        ),
      },
      live: projected
        ? {
            ...projected,
            startingStrokes: getSnapshotStartingStrokes(
              card.id,
              projected,
              projectedStrokes,
            ),
          }
        : null,
      lastUpdatedAt: args.lastUpdatedAt ?? null,
    });
  }

  return snapshots;
}
