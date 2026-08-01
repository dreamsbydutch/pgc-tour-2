import { describe, expect, it } from "vitest";

import {
  buildCompetitionRanks,
  buildLeaderboardStandingsProjections,
  buildPlayoffStartingStrokes,
  getPlayoffDestination,
} from "./leaderboardStandings";

const tours = [
  { id: "tour-a", playoffSpots: [1, 1] },
  { id: "tour-b", playoffSpots: [1, 1] },
];

function buildProjection(overrides?: {
  teams?: Array<{ tourCardId: string; points?: number | null }>;
  tourCards?: Array<{ id: string; tourId: string; points: number }>;
  status?: "upcoming" | "active" | "completed" | "cancelled";
  isPlayoff?: boolean;
}) {
  return buildLeaderboardStandingsProjections({
    tournamentStatus: overrides?.status ?? "active",
    isPlayoff: overrides?.isPlayoff ?? false,
    lastUpdatedAt: 123,
    tours,
    tourCards: overrides?.tourCards ?? [
      { id: "a-1", tourId: "tour-a", points: 100 },
      { id: "a-2", tourId: "tour-a", points: 90 },
      { id: "a-3", tourId: "tour-a", points: 80 },
      { id: "b-1", tourId: "tour-b", points: 110 },
      { id: "b-2", tourId: "tour-b", points: 70 },
    ],
    teams: overrides?.teams ?? [
      { tourCardId: "a-1", points: 0 },
      { tourCardId: "a-2", points: 20 },
      { tourCardId: "a-3", points: 5 },
      { tourCardId: "b-1", points: 0 },
      { tourCardId: "b-2", points: 10 },
    ],
  });
}

describe("leaderboard standings projections", () => {
  it("adds provisional points and applies competition ranks within each tour", () => {
    const projection = buildProjection();

    expect(projection.get("a-2")?.live).toMatchObject({
      points: 110,
      position: "1",
      destination: "gold",
    });
    expect(projection.get("a-1")?.beforeTournament).toMatchObject({
      points: 100,
      position: "1",
    });
    expect(projection.get("b-1")?.live?.position).toBe("1");
  });

  it("shares ranks, skips the next position, and qualifies boundary ties", () => {
    const cards = [
      { id: "one", tourId: "tour-a", points: 100 },
      { id: "two", tourId: "tour-a", points: 90 },
      { id: "three", tourId: "tour-a", points: 90 },
      { id: "four", tourId: "tour-a", points: 80 },
    ];
    const ranks = buildCompetitionRanks(cards);

    expect(ranks.get("two")?.position).toBe("T2");
    expect(ranks.get("four")?.position).toBe("4");
    expect(
      getPlayoffDestination({ betterCount: 1, playoffSpots: [1, 1] }),
    ).toBe("silver");
    expect(
      getPlayoffDestination({ betterCount: 0, playoffSpots: [1, 1] }),
    ).toBe("gold");
  });

  it("keeps a card without a tournament team at its official points", () => {
    const projection = buildProjection({
      teams: [
        { tourCardId: "a-1", points: 5 },
        { tourCardId: "a-2", points: 0 },
        { tourCardId: "b-1", points: 0 },
        { tourCardId: "b-2", points: 0 },
      ],
    });

    expect(projection.get("a-3")?.live?.points).toBe(80);
  });

  it("withholds a tour's live snapshot when one of its teams has no points", () => {
    const projection = buildProjection({
      teams: [
        { tourCardId: "a-1", points: 5 },
        { tourCardId: "a-2" },
        { tourCardId: "b-1", points: 0 },
        { tourCardId: "b-2", points: 0 },
      ],
    });

    expect(projection.get("a-1")?.live).toBeNull();
    expect(projection.get("a-2")?.live).toBeNull();
    expect(projection.get("b-1")?.live).not.toBeNull();
    expect(projection.get("b-1")?.live?.startingStrokes).toBeNull();
  });

  it("does not build cards outside an active regular tournament", () => {
    expect(buildProjection({ status: "completed" }).size).toBe(0);
    expect(buildProjection({ status: "upcoming" }).size).toBe(0);
    expect(buildProjection({ isPlayoff: true }).size).toBe(0);
  });
});

describe("playoff starting strokes", () => {
  it("scales Gold from minus ten to zero and pools cards across tours", () => {
    const strokes = buildPlayoffStartingStrokes(
      [
        { id: "tour-a-leader", points: 200 },
        { id: "tour-b-middle", points: 150 },
        { id: "tour-a-low", points: 100 },
      ],
      "gold",
    );

    expect(strokes.get("tour-a-leader")).toBe(-10);
    expect(strokes.get("tour-b-middle")).toBe(-5);
    expect(strokes.get("tour-a-low")).toBe(0);
  });

  it("uses the Silver floor and averages a tie across the floor boundary", () => {
    const cards = Array.from({ length: 38 }, (_, index) => ({
      id: `card-${index}`,
      points: 200 - index,
    }));
    cards[34]!.points = 166;
    cards[35]!.points = 166;
    cards[36]!.points = 166;
    const strokes = buildPlayoffStartingStrokes(cards, "silver");

    expect(strokes.get("card-0")).toBe(-10);
    expect(strokes.get("card-37")).toBe(0);
    expect(strokes.get("card-34")).toBe(strokes.get("card-35"));
    expect(strokes.get("card-35")).toBe(strokes.get("card-36"));
  });
});
