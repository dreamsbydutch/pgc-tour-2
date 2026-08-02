import { api, Id, useQuery } from "@/convex";

export function useHoleScorecard(
  tournamentId: Id<"tournaments">,
  golferId: Id<"golfers">,
  enabled: boolean,
) {
  return useQuery(
    api.functions.espnGolf.getPlayerHoleScorecard,
    enabled ? { tournamentId, golferId } : "skip",
  );
}

export function useTeamHoleScorecard(
  tournamentId: Id<"tournaments">,
  golferIds: Id<"golfers">[],
  enabled: boolean,
) {
  return useQuery(
    api.functions.espnGolf.getTeamHoleScorecards,
    enabled && golferIds.length > 0 ? { tournamentId, golferIds } : "skip",
  );
}
