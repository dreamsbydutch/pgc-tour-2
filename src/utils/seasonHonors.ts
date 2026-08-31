import type { SeasonHonors } from "@/types";

type BracketResult = {
  teams: Array<{
    tourCardId: string;
    displayName?: string;
    position?: string;
    score?: number;
  }>;
  tourCards: Array<{ _id: string; displayName: string }>;
};

export function resolveHomeSeasonHonors(args: {
  backendHonors: SeasonHonors | null | undefined;
  tournamentId: string;
  goldResult: BracketResult | undefined;
  silverResult: BracketResult | undefined;
}): SeasonHonors | null {
  if (args.backendHonors !== undefined) return args.backendHonors;
  if (!args.goldResult || !args.silverResult) return null;

  const projectWinner = (result: BracketResult) => {
    const firstPlaceTeams = result.teams.filter(
      (team) => team.position?.trim() === "1",
    );
    if (firstPlaceTeams.length !== 1) return null;
    const team = firstPlaceTeams[0]!;
    const displayName =
      team.displayName ??
      result.tourCards.find((card) => card._id === team.tourCardId)
        ?.displayName;
    if (!displayName) return null;
    return {
      displayName,
      score: typeof team.score === "number" ? team.score : null,
    };
  };

  const champion = projectWinner(args.goldResult);
  if (!champion) return null;
  return {
    tournamentId: args.tournamentId,
    champion,
    silverChampion: projectWinner(args.silverResult),
  };
}
