export type PlayoffLevel = 0 | 1 | 2;

export type PlayoffAssignmentCard = {
  id: string;
  tourId: string;
  points: number;
};

export type PlayoffAssignmentTour = {
  id: string;
  playoffSpots: readonly number[];
};

const roundToOneDecimal = (value: number) => Math.round(value * 10) / 10;

/**
 * Returns a card's playoff bracket from its regular-season points rank.
 * Counting cards with strictly more points preserves competition-rank ties at
 * a playoff boundary.
 */
export function getPlayoffLevel(args: {
  card: PlayoffAssignmentCard;
  cards: PlayoffAssignmentCard[];
  tour: PlayoffAssignmentTour | undefined;
}): PlayoffLevel {
  if (!args.tour) return 0;

  const goldSpots = Math.max(0, Math.trunc(args.tour.playoffSpots[0] ?? 0));
  const silverSpots = Math.max(0, Math.trunc(args.tour.playoffSpots[1] ?? 0));
  const betterPointsCount = args.cards.filter(
    (candidate) =>
      candidate.tourId === args.card.tourId &&
      candidate.points > args.card.points,
  ).length;

  if (betterPointsCount < goldSpots) return 1;
  if (betterPointsCount < goldSpots + silverSpots) return 2;
  return 0;
}

/** Builds the canonical Gold/Silver assignment for every card in a season. */
export function buildPlayoffAssignments(args: {
  cards: PlayoffAssignmentCard[];
  tours: PlayoffAssignmentTour[];
}): Map<string, PlayoffLevel> {
  const tourById = new Map(args.tours.map((tour) => [tour.id, tour]));
  return new Map(
    args.cards.map((card) => [
      card.id,
      getPlayoffLevel({
        card,
        cards: args.cards,
        tour: tourById.get(card.tourId),
      }),
    ]),
  );
}

/**
 * Calculates the initial playoff score for one bracket from season points.
 * Gold scales from -10 to 0. Silver uses the existing 36th-place floor, so
 * lower qualifiers start at even par. Point ties share the average of their
 * occupied stroke slots.
 */
export function buildPlayoffStartingStrokes(
  cards: Array<Pick<PlayoffAssignmentCard, "id" | "points">>,
  level: Exclude<PlayoffLevel, 0>,
): Map<string, number> {
  const strokesById = new Map<string, number>();
  if (cards.length === 0) return strokesById;

  const sorted = cards.slice().sort((a, b) => {
    const pointDelta = b.points - a.points;
    return pointDelta !== 0 ? pointDelta : a.id.localeCompare(b.id);
  });
  const baseStrokes: number[] = [];

  if (level === 1) {
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

export function buildSeasonPlayoffStartingStrokes(args: {
  cards: PlayoffAssignmentCard[];
  assignments: Map<string, PlayoffLevel>;
}): Map<string, number> {
  const strokes = new Map<string, number>();
  for (const level of [1, 2] as const) {
    const bracketStrokes = buildPlayoffStartingStrokes(
      args.cards.filter((card) => args.assignments.get(card.id) === level),
      level,
    );
    for (const [cardId, value] of bracketStrokes) {
      strokes.set(cardId, value);
    }
  }
  return strokes;
}
