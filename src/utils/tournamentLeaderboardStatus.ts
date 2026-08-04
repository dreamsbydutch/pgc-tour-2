import type {
  ResolveTournamentLeaderboardStateArgs,
  TournamentLeaderboardState,
} from "@/types";

export function resolveTournamentLeaderboardState(
  args: ResolveTournamentLeaderboardStateArgs,
): TournamentLeaderboardState {
  const now = args.now ?? Date.now();

  if (args.status === "cancelled") return "cancelled";
  if (args.status === "completed" || args.endDate < now) return "final";
  if (args.status === "upcoming" || args.startDate > now) return "upcoming";
  return args.freshness === "live" ? "live" : "reconnecting";
}
