import { v } from "convex/values";

import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import {
  checkCompatabilityOfEventNames,
  fetchFromDataGolf,
} from "../utils/datagolf";

const LIVE_STATS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type RawHoleScoring = {
  avg_score: number;
  players_thru: number;
  eagles_or_better: number;
  birdies: number;
  pars: number;
  bogeys: number;
  doubles_or_worse: number;
};

type RawHole = {
  hole: number;
  par: number;
  yardage: number;
  total: RawHoleScoring;
};

type RawRound = {
  round_num: number;
  holes: RawHole[];
};

type RawCourse = {
  course_code: string;
  rounds: RawRound[];
};

type RawLiveHoleStats = {
  event_name: string;
  last_update: string;
  current_round: number;
  courses: RawCourse[];
};

type TournamentHoleStatsContext = {
  name: string;
  startDate: number;
  endDate: number;
  courseApiId?: string;
  courseName?: string;
};

type TournamentHoleStatsResult =
  | {
      status: "available";
      eventName: string;
      courseName: string;
      courseCode: string;
      round: number;
      lastUpdated: string;
      holes: RawHole[];
    }
  | {
      status: "unavailable";
      reason:
        | "tournament_not_found"
        | "outside_live_window"
        | "invalid_response"
        | "event_mismatch"
        | "course_not_found"
        | "round_not_found"
        | "upstream_unavailable";
    };

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseScoring(value: unknown): RawHoleScoring | null {
  if (!value || typeof value !== "object") return null;
  const scoring = value as Record<string, unknown>;
  const avgScore = finiteNumber(scoring.avg_score);
  const playersThru = finiteNumber(scoring.players_thru);
  const eaglesOrBetter = finiteNumber(scoring.eagles_or_better);
  const birdies = finiteNumber(scoring.birdies);
  const pars = finiteNumber(scoring.pars);
  const bogeys = finiteNumber(scoring.bogeys);
  const doublesOrWorse = finiteNumber(scoring.doubles_or_worse);

  if (
    avgScore === null ||
    playersThru === null ||
    eaglesOrBetter === null ||
    birdies === null ||
    pars === null ||
    bogeys === null ||
    doublesOrWorse === null
  ) {
    return null;
  }

  return {
    avg_score: avgScore,
    players_thru: playersThru,
    eagles_or_better: eaglesOrBetter,
    birdies,
    pars,
    bogeys,
    doubles_or_worse: doublesOrWorse,
  };
}

function parseLiveHoleStats(value: unknown): RawLiveHoleStats | null {
  if (!value || typeof value !== "object") return null;
  const response = value as Record<string, unknown>;
  if (!Array.isArray(response.courses)) return null;

  const courses = response.courses.flatMap((courseValue) => {
    if (!courseValue || typeof courseValue !== "object") return [];
    const course = courseValue as Record<string, unknown>;
    if (!Array.isArray(course.rounds)) return [];

    const rounds = course.rounds.flatMap((roundValue) => {
      if (!roundValue || typeof roundValue !== "object") return [];
      const round = roundValue as Record<string, unknown>;
      const roundNum = finiteNumber(round.round_num);
      if (roundNum === null || !Array.isArray(round.holes)) return [];

      const holes = round.holes.flatMap((holeValue) => {
        if (!holeValue || typeof holeValue !== "object") return [];
        const hole = holeValue as Record<string, unknown>;
        const holeNumber = finiteNumber(hole.hole);
        const par = finiteNumber(hole.par);
        const yardage = finiteNumber(hole.yardage);
        const total = parseScoring(hole.total);
        if (
          holeNumber === null ||
          par === null ||
          yardage === null ||
          total === null
        ) {
          return [];
        }
        return [{ hole: holeNumber, par, yardage, total }];
      });

      return holes.length > 0 ? [{ round_num: roundNum, holes }] : [];
    });

    return rounds.length > 0
      ? [{ course_code: String(course.course_code ?? ""), rounds }]
      : [];
  });

  const currentRound = finiteNumber(response.current_round);
  const eventName = String(response.event_name ?? "").trim();
  if (!eventName || currentRound === null || courses.length === 0) return null;

  return {
    event_name: eventName,
    last_update: String(response.last_update ?? "").trim(),
    current_round: currentRound,
    courses,
  };
}

function normalizedCourseCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Returns a small, validated view of DataGolf's current hole-difficulty feed.
 * Historical tournaments intentionally do not call the live endpoint because it
 * only describes DataGolf's current PGA Tour event.
 */
export const getTournamentHoleStats = action({
  args: { tournamentId: v.id("tournaments") },
  handler: async (ctx, args): Promise<TournamentHoleStatsResult> => {
    const context: TournamentHoleStatsContext | null = await ctx.runQuery(
      internal.functions.tournamentCourseStatsContext.getRequestContext,
      args,
    );
    if (!context) {
      return { status: "unavailable", reason: "tournament_not_found" } as const;
    }

    const now = Date.now();
    if (
      now < context.startDate - LIVE_STATS_WINDOW_MS ||
      now > context.endDate + LIVE_STATS_WINDOW_MS
    ) {
      return { status: "unavailable", reason: "outside_live_window" } as const;
    }

    try {
      const raw = await fetchFromDataGolf<unknown>(
        "/preds/live-hole-stats?tour=pga&file_format=json",
      );
      const data = parseLiveHoleStats(raw);
      if (!data) {
        return { status: "unavailable", reason: "invalid_response" } as const;
      }

      const compatibility = checkCompatabilityOfEventNames(
        context.name,
        data.event_name,
      );
      if (!compatibility.ok) {
        return { status: "unavailable", reason: "event_mismatch" } as const;
      }

      const requestedCode = normalizedCourseCode(context.courseApiId ?? "");
      const matchingCourse = requestedCode
        ? data.courses.find(
            (course) =>
              normalizedCourseCode(course.course_code) === requestedCode,
          )
        : undefined;
      const course =
        matchingCourse ??
        (data.courses.length === 1 ? data.courses[0] : undefined);
      if (!course) {
        return { status: "unavailable", reason: "course_not_found" } as const;
      }

      const currentRound =
        course.rounds.find((round) => round.round_num === data.current_round) ??
        [...course.rounds].sort((a, b) => b.round_num - a.round_num)[0];
      if (!currentRound) {
        return { status: "unavailable", reason: "round_not_found" } as const;
      }

      return {
        status: "available",
        eventName: data.event_name,
        courseName: context.courseName ?? "Course",
        courseCode: course.course_code,
        round: currentRound.round_num,
        lastUpdated: data.last_update,
        holes: currentRound.holes
          .filter((hole) => hole.hole >= 1 && hole.hole <= 18)
          .sort((a, b) => a.hole - b.hole),
      } as const;
    } catch (error) {
      console.error("Unable to load DataGolf hole stats", error);
      return { status: "unavailable", reason: "upstream_unavailable" } as const;
    }
  },
});
