import { describe, expect, it } from "vitest";
import {
  hasRealTournamentGroups,
  selectTournamentLeaderboardDefault,
} from "./tournaments";

type TestTournament = {
  _id: string;
  name: string;
  startDate: number;
  endDate: number;
  status?: "upcoming" | "active" | "completed" | "cancelled";
};

function makeTournament(args: {
  id: string;
  startDate: number;
  endDate: number;
  status?: TestTournament["status"];
}): TestTournament {
  return {
    _id: args.id,
    name: args.id,
    startDate: args.startDate,
    endDate: args.endDate,
    status: args.status,
  };
}

describe("selectTournamentLeaderboardDefault", () => {
  it("returns the explicit tournament when one is provided", () => {
    const now = 1_000;
    const explicitTournament = makeTournament({
      id: "explicit",
      startDate: 2_000,
      endDate: 3_000,
      status: "upcoming",
    });

    const selected = selectTournamentLeaderboardDefault({
      explicitTournament,
      tournaments: [
        makeTournament({
          id: "active",
          startDate: 900,
          endDate: 1_100,
          status: "active",
        }),
        explicitTournament,
      ],
      now,
      nextUpcomingHasGroups: false,
    });

    expect(selected?._id).toBe("explicit");
  });

  it("prefers the active tournament by status", () => {
    const now = 10_000;

    const selected = selectTournamentLeaderboardDefault({
      tournaments: [
        makeTournament({
          id: "completed",
          startDate: 1_000,
          endDate: 2_000,
          status: "completed",
        }),
        makeTournament({
          id: "active",
          startDate: 20_000,
          endDate: 21_000,
          status: "active",
        }),
        makeTournament({
          id: "upcoming",
          startDate: 30_000,
          endDate: 31_000,
          status: "upcoming",
        }),
      ],
      now,
      nextUpcomingHasGroups: false,
    });

    expect(selected?._id).toBe("active");
  });

  it("prefers the date-active tournament when status is stale", () => {
    const now = 10_000;

    const selected = selectTournamentLeaderboardDefault({
      tournaments: [
        makeTournament({
          id: "completed",
          startDate: 1_000,
          endDate: 2_000,
          status: "completed",
        }),
        makeTournament({
          id: "date-active",
          startDate: 9_000,
          endDate: 11_000,
          status: "upcoming",
        }),
        makeTournament({
          id: "upcoming",
          startDate: 20_000,
          endDate: 21_000,
          status: "upcoming",
        }),
      ],
      now,
      nextUpcomingHasGroups: false,
    });

    expect(selected?._id).toBe("date-active");
  });

  it("keeps the recent completed tournament during the first 72 hours when the next tournament has no groups", () => {
    const recentCompleted = makeTournament({
      id: "recent-completed",
      startDate: 100_000,
      endDate: 200_000,
      status: "completed",
    });
    const upcoming = makeTournament({
      id: "upcoming",
      startDate: 500_000_000,
      endDate: 500_100_000,
      status: "upcoming",
    });

    const selected = selectTournamentLeaderboardDefault({
      tournaments: [recentCompleted, upcoming],
      now: recentCompleted.endDate + 71 * 60 * 60 * 1_000,
      nextUpcomingHasGroups: false,
    });

    expect(selected?._id).toBe("recent-completed");
  });

  it("switches to the next upcoming tournament inside the 72-hour window when groups are ready", () => {
    const recentCompleted = makeTournament({
      id: "recent-completed",
      startDate: 100_000,
      endDate: 200_000,
      status: "completed",
    });
    const upcoming = makeTournament({
      id: "upcoming",
      startDate: 500_000_000,
      endDate: 500_100_000,
      status: "upcoming",
    });

    const selected = selectTournamentLeaderboardDefault({
      tournaments: [recentCompleted, upcoming],
      now: recentCompleted.endDate + 24 * 60 * 60 * 1_000,
      nextUpcomingHasGroups: true,
    });

    expect(selected?._id).toBe("upcoming");
  });

  it("switches to the next upcoming tournament after 72 hours even without groups", () => {
    const recentCompleted = makeTournament({
      id: "recent-completed",
      startDate: 100_000,
      endDate: 200_000,
      status: "completed",
    });
    const upcoming = makeTournament({
      id: "upcoming",
      startDate: 500_000_000,
      endDate: 500_100_000,
      status: "upcoming",
    });

    const selected = selectTournamentLeaderboardDefault({
      tournaments: [recentCompleted, upcoming],
      now: recentCompleted.endDate + 72 * 60 * 60 * 1_000,
      nextUpcomingHasGroups: false,
    });

    expect(selected?._id).toBe("upcoming");
  });

  it("keeps the recent completed tournament when there is no upcoming tournament", () => {
    const recentCompleted = makeTournament({
      id: "recent-completed",
      startDate: 100_000,
      endDate: 200_000,
      status: "completed",
    });

    const selected = selectTournamentLeaderboardDefault({
      tournaments: [recentCompleted],
      now: recentCompleted.endDate + 24 * 60 * 60 * 1_000,
      nextUpcomingHasGroups: false,
    });

    expect(selected?._id).toBe("recent-completed");
  });
});

describe("hasRealTournamentGroups", () => {
  it("does not treat ungrouped placeholder golfers as ready", () => {
    expect(
      hasRealTournamentGroups([
        { group: 0 },
        { group: 0 },
        { group: null },
        {},
      ]),
    ).toBe(false);
  });

  it("treats positive group numbers as ready", () => {
    expect(hasRealTournamentGroups([{ group: 0 }, { group: 3 }])).toBe(true);
  });
});
