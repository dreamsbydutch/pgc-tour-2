import { useMemo } from "react";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/tanstack-react-start";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

import type {
  LeaderboardPgaRow,
  LeaderboardTeamRow,
  LeaderboardViewModel,
  LeaderboardViewModelReady,
  LeaderboardViewerContext,
} from "@/components/leaderboardView/utils/types";

type TournamentLeaderboardPayload =
  | {
      tournament: {
        name: string;
        currentRound?: number | null;
        livePlay?: boolean | null;
        seasonId: Id<"seasons">;
        tier?: { name?: string | null } | null;
      };
      teams: Array<{
        _id: Id<"teams">;
        tourCardId: Id<"tourCards">;
        golferIds: number[];

        pastPosition?: string | null;
        position?: string | null;

        today?: number | null;
        thru?: number | null;
        score?: number | null;

        points?: number | null;
        earnings?: number | null;

        roundOne?: number | null;
        roundTwo?: number | null;
        roundThree?: number | null;
        roundFour?: number | null;

        tourCard: null | {
          _id: Id<"tourCards">;
          clerkId?: string | null;
          displayName: string;
          tourId?: string | null;
          playoff?: number | null;
        };
      }>;
      golfers: Array<{
        _id: Id<"tournamentGolfers">;
        golferId: Id<"golfers">;

        apiId?: number | null;
        position?: string | null;
        posChange?: number | null;
        score?: number | null;
        today?: number | null;
        thru?: number | null;
        endHole?: number | null;

        group?: number | null;
        rating?: number | null;

        roundOne?: number | null;
        roundTwo?: number | null;
        roundThree?: number | null;
        roundFour?: number | null;

        usage?: number | null;
        makeCut?: number | null;
        topTen?: number | null;
        win?: number | null;
        worldRank?: number | null;

        teeTimeRoundOne?: string | null;
        teeTimeRoundTwo?: string | null;
        teeTimeRoundThree?: string | null;
        teeTimeRoundFour?: string | null;

        golfer: {
          apiId?: number | null;
          playerName: string;
          country?: string | null;
          worldRank?: number | null;
        };
      }>;
      tours: Array<{
        _id: Id<"tours">;
        name: string;
        shortForm: string;
        logoUrl: string;
      }>;
      viewer: null | { member: unknown | null; tourCard: unknown | null };
    }
  | null
  | undefined;

function pickTeeTimeDisplay(args: {
  currentRound: number | null;
  row: {
    teeTimeRoundOne?: string | null;
    teeTimeRoundTwo?: string | null;
    teeTimeRoundThree?: string | null;
    teeTimeRoundFour?: string | null;
  };
}): string | null {
  const round = args.currentRound ?? 0;
  if (round === 1) return args.row.teeTimeRoundOne ?? null;
  if (round === 2) return args.row.teeTimeRoundTwo ?? null;
  if (round === 3) return args.row.teeTimeRoundThree ?? null;
  if (round === 4) return args.row.teeTimeRoundFour ?? null;
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractViewerContext(
  viewer: unknown,
): LeaderboardViewerContext | undefined {
  if (!isRecord(viewer)) return undefined;
  const member = viewer.member;
  const tourCard = viewer.tourCard;

  const friendIds = (() => {
    if (!isRecord(member)) return null;
    const rawFriends = member.friends;
    if (!Array.isArray(rawFriends)) return null;
    return rawFriends.filter((x): x is string => typeof x === "string");
  })();

  const tourCardId = (() => {
    if (!isRecord(tourCard)) return null;
    const id = tourCard._id;
    return typeof id === "string" ? id : null;
  })();

  return {
    tourCardId,
    friendIds,
    teamGolferApiIds: null,
  };
}

/**
 * Builds the leaderboard view model for a tournament from a single Convex convenience query.
 *
 * @param args.tournamentId Convex tournament id (string) or null when not selected.
 */
export function useLeaderboardViewData(args: { tournamentId: string | null }) {
  const { user } = useUser();
  const viewerClerkId = user?.id;

  const result = useQuery(
    api.functions.tournaments.getTournamentLeaderboardView,
    args.tournamentId
      ? {
          tournamentId: args.tournamentId as Id<"tournaments">,
          options: {
            includeTours: true,
            includeViewer: Boolean(viewerClerkId),
            viewerClerkId: viewerClerkId ?? undefined,
          },
        }
      : "skip",
  ) as TournamentLeaderboardPayload;

  const model = useMemo<LeaderboardViewModel>(() => {
    if (args.tournamentId && result === undefined) return { kind: "loading" };
    if (!args.tournamentId)
      return { kind: "error", message: "No tournament selected" };
    if (result === null)
      return { kind: "error", message: "Tournament not found" };
    if (!result) return { kind: "loading" };

    const viewer = result.viewer
      ? extractViewerContext(result.viewer)
      : undefined;

    const tournamentLite = {
      name: result.tournament.name,
      currentRound: result.tournament.currentRound ?? null,
      livePlay: result.tournament.livePlay ?? null,
    };

    const pgaRows: LeaderboardPgaRow[] = [];
    for (const tg of result.golfers as Array<
      (typeof result.golfers)[number] | null
    >) {
      if (!tg) continue;
      const apiId = tg.golfer.apiId ?? tg.apiId ?? null;
      if (apiId === null) continue;

      pgaRows.push({
        kind: "pga",
        id: String(tg._id),
        apiId,

        position: tg.position ?? null,
        posChange: tg.posChange ?? null,
        playerName: tg.golfer.playerName,

        score: tg.score ?? null,
        today: tg.today ?? null,
        thru: tg.thru ?? null,
        endHole: tg.endHole ?? null,

        group: tg.group ?? null,
        rating: tg.rating ?? null,

        roundOne: tg.roundOne ?? null,
        roundTwo: tg.roundTwo ?? null,
        roundThree: tg.roundThree ?? null,
        roundFour: tg.roundFour ?? null,

        usage: tg.usage ?? null,
        makeCut: tg.makeCut ?? null,
        topTen: tg.topTen ?? null,
        win: tg.win ?? null,
        worldRank: tg.worldRank ?? tg.golfer.worldRank ?? null,

        country: tg.golfer.country ?? null,

        teeTimeDisplay: pickTeeTimeDisplay({
          currentRound: tournamentLite.currentRound,
          row: tg,
        }),
      });
    }

    const pgcRows: LeaderboardTeamRow[] = [];
    for (const team of result.teams as Array<
      (typeof result.teams)[number] | null
    >) {
      if (!team) continue;
      if (!team.tourCard) continue;

      pgcRows.push({
        kind: "pgc",
        id: String(team._id),

        pastPosition: team.pastPosition ?? null,
        position: team.position ?? null,

        golferApiIds: team.golferIds ?? [],

        today: team.today ?? null,
        thru: team.thru ?? null,
        score: team.score ?? null,

        points: team.points ?? null,
        earnings: team.earnings ?? null,

        roundOne: team.roundOne ?? null,
        roundTwo: team.roundTwo ?? null,
        roundThree: team.roundThree ?? null,
        roundFour: team.roundFour ?? null,

        tourCard: {
          id: String(team.tourCard._id),
          ownerClerkId: team.tourCard.clerkId ?? null,
          displayName: team.tourCard.displayName,
          tourId: team.tourCard.tourId ?? null,
          playoff: team.tourCard.playoff ?? null,
        },

        championsCount: null,
        teeTimeDisplay: null,
      });
    }

    const ready: LeaderboardViewModelReady = {
      kind: "ready",
      tournament: tournamentLite,
      toggleTours: [],
      pgaRows,
      pgcRows,
      viewer,
    };

    return ready;
  }, [args.tournamentId, result]);

  const modelWithViewer = useMemo<LeaderboardViewModel>(() => {
    if (model.kind !== "ready") return model;

    const viewer = model.viewer;
    if (!viewerClerkId || !result || !result.viewer) return model;

    const viewerTourCardId = viewer?.tourCardId ?? null;
    if (!viewerTourCardId) return model;

    const viewerTeam = model.pgcRows.find(
      (t) => t.tourCard.id === viewerTourCardId,
    );
    const teamGolferApiIds = viewerTeam?.golferApiIds ?? null;

    return {
      ...model,
      viewer: {
        ...(viewer ?? {}),
        teamGolferApiIds,
      },
    };
  }, [model, viewerClerkId, result]);

  return {
    model: modelWithViewer,
    tours:
      result && result !== null && result !== undefined
        ? result.tours
        : ([] as Array<{
            _id: string;
            name: string;
            shortForm: string;
            logoUrl: string;
          }>),
    tierName:
      result && result !== null && result !== undefined
        ? (result.tournament.tier?.name ?? null)
        : null,
  };
}
