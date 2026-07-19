import { describe, expect, it } from "vitest";
import {
  findEspnGolferMatch,
  mergeEspnRounds,
  normalizeEspnIdentityName,
  parseEspnGolfScoreboard,
  parseRelativeToPar,
  selectEspnGolfEvent,
} from "./espnGolf";

function scoreboardFixture() {
  return {
    events: [
      {
        id: "event-open",
        name: "The Open",
        date: "2026-07-16T04:00Z",
        competitions: [
          {
            competitors: [
              {
                id: "athlete-1",
                athlete: { id: "athlete-1", displayName: "José Smith Jr." },
                linescores: [
                  {
                    period: 1,
                    value: 69,
                    linescores: [
                      {
                        period: 1,
                        value: 3,
                        scoreType: { displayValue: "-1" },
                      },
                      {
                        period: 2,
                        value: 4,
                        scoreType: { displayValue: "E" },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        id: "event-corales",
        name: "Corales Puntacana Championship",
        competitions: [{ competitors: [] }],
      },
    ],
  };
}

describe("ESPN golf scorecard parsing", () => {
  it("parses nested rounds and hole scores", () => {
    const events = parseEspnGolfScoreboard(scoreboardFixture());
    expect(events).toHaveLength(2);
    expect(events[0]?.players[0]).toMatchObject({
      espnAthleteId: "athlete-1",
      playerName: "José Smith Jr.",
      rounds: [
        {
          round: 1,
          totalStrokes: 69,
          holes: [
            { hole: 1, strokes: 3, relativeToPar: -1 },
            { hole: 2, strokes: 4, relativeToPar: 0 },
          ],
        },
      ],
    });
  });

  it("drops malformed holes without rejecting valid cells", () => {
    const payload = scoreboardFixture();
    payload.events[0]!.competitions[0]!.competitors[0]!.linescores[0]!.linescores.push(
      {
        period: 19,
        value: 3,
        scoreType: { displayValue: "?" },
      },
    );
    expect(
      parseEspnGolfScoreboard(payload)[0]?.players[0]?.rounds[0]?.holes,
    ).toHaveLength(2);
    expect(parseEspnGolfScoreboard({ nope: true })).toEqual([]);
  });

  it("selects the unique compatible event on a simultaneous-event date", () => {
    const events = parseEspnGolfScoreboard(scoreboardFixture());
    expect(selectEspnGolfEvent(events, "Open Championship")?.espnEventId).toBe(
      "event-open",
    );
    expect(
      selectEspnGolfEvent(events, "Corales Puntacana Championship")
        ?.espnEventId,
    ).toBe("event-corales");
  });

  it("normalizes accents, punctuation, and suffixes for exact matching", () => {
    expect(normalizeEspnIdentityName("José Smith, Jr.")).toBe("jose smith");
    expect(normalizeEspnIdentityName("JOSE  SMITH")).toBe("jose smith");
  });

  it("parses ESPN par differentials", () => {
    expect(parseRelativeToPar("E")).toBe(0);
    expect(parseRelativeToPar("-2")).toBe(-2);
    expect(parseRelativeToPar("+3")).toBe(3);
    expect(parseRelativeToPar("unknown")).toBeUndefined();
  });
});

describe("mergeEspnRounds", () => {
  it("preserves missing cells and applies later corrections", () => {
    const merged = mergeEspnRounds(
      [
        {
          round: 1,
          totalStrokes: 70,
          holes: [
            { hole: 1, strokes: 4, relativeToPar: 0 },
            { hole: 2, strokes: 5, relativeToPar: 1 },
          ],
        },
      ],
      [
        {
          round: 1,
          holes: [
            { hole: 2, strokes: 4, relativeToPar: 0 },
            { hole: 3, strokes: 3, relativeToPar: -1 },
          ],
        },
      ],
    );
    expect(merged[0]?.totalStrokes).toBe(70);
    expect(merged[0]?.holes).toEqual([
      { hole: 1, strokes: 4, relativeToPar: 0 },
      { hole: 2, strokes: 4, relativeToPar: 0 },
      { hole: 3, strokes: 3, relativeToPar: -1 },
    ]);
  });
});

describe("findEspnGolferMatch", () => {
  const localGolfers = [
    { golferId: "golfer-1", playerName: "José Smith Jr." },
    { golferId: "golfer-2", playerName: "Alex Lee" },
  ];

  it("prefers a saved ESPN identity mapping", () => {
    expect(
      findEspnGolferMatch({
        espnAthleteId: "espn-1",
        playerName: "Different Display Name",
        localGolfers,
        mappings: [{ golferId: "golfer-1", espnAthleteId: "espn-1" }],
      }),
    ).toEqual({ golferId: "golfer-1", matchMethod: "saved" });
  });

  it("uses one unique normalized exact name", () => {
    expect(
      findEspnGolferMatch({
        espnAthleteId: "espn-1",
        playerName: "Jose Smith",
        localGolfers,
        mappings: [],
      }),
    ).toEqual({ golferId: "golfer-1", matchMethod: "exact_name" });
  });

  it("rejects ambiguous names and conflicting saved identities", () => {
    expect(
      findEspnGolferMatch({
        espnAthleteId: "espn-new",
        playerName: "Alex Lee",
        localGolfers: [
          ...localGolfers,
          { golferId: "golfer-3", playerName: "Alex Lee" },
        ],
        mappings: [],
      }),
    ).toBeNull();
    expect(
      findEspnGolferMatch({
        espnAthleteId: "espn-new",
        playerName: "Alex Lee",
        localGolfers,
        mappings: [{ golferId: "golfer-2", espnAthleteId: "espn-existing" }],
      }),
    ).toBeNull();
  });
});
