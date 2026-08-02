import { api, Id, useMutation } from "@/convex";

export function useTournamentTeam() {
  const saveMutation = useMutation(api.functions.teams.saveMyTournamentTeam);
  return {
    saveTeam: (args: {
      tournamentId: string;
      tourCardId: string;
      golferIds: number[];
    }) =>
      saveMutation({
        tournamentId: args.tournamentId as Id<"tournaments">,
        tourCardId: args.tourCardId as Id<"tourCards">,
        golferIds: args.golferIds,
      }),
  };
}
