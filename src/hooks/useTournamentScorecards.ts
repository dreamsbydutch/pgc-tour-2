import { api, Id, useQuery } from "@/convex";
import { useHoleScorecard, useTeamHoleScorecard } from "./useHoleScorecard";

export function useTeamDetail(teamId: string, enabled: boolean) {
  return useQuery(
    api.functions.tournaments.getTeamDetail,
    enabled ? { teamId: teamId as Id<"teams"> } : "skip",
  );
}

export function useTeamHoleScorecards(
  tournamentId: Id<"tournaments">,
  golferIds: Id<"golfers">[],
  enabled: boolean,
) {
  return useTeamHoleScorecard(tournamentId, golferIds, enabled);
}

export function usePlayerHoleScorecard(
  tournamentId: Id<"tournaments">,
  golferId: Id<"golfers">,
  enabled: boolean,
) {
  return useHoleScorecard(tournamentId, golferId, enabled);
}
