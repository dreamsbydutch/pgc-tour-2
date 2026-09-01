import type { SeasonHonors } from "@/types";

type BracketResult = {
  teams: Array<{
    tourCardId: string;
    displayName?: string;
    position?: string;
    score?: number;
    tourId?: string;
  }>;
  tourCards: Array<{ _id: string; displayName: string; tourId: string }>;
};

export function resolveHomeSeasonHonors(args: {
  backendHonors: SeasonHonors | null | undefined;
  tournamentId: string;
  tours: Array<{
    _id: string;
    name: string;
    shortForm: string;
    logoUrl: string | null;
  }>;
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
    const card = result.tourCards.find(
      (candidate) => candidate._id === team.tourCardId,
    );
    const displayName = team.displayName ?? card?.displayName;
    if (!displayName) return null;
    const tour = args.tours.find(
      (candidate) => candidate._id === (team.tourId ?? card?.tourId),
    );
    return {
      displayName,
      score: typeof team.score === "number" ? team.score : null,
      tour: tour
        ? {
            name: tour.name,
            shortForm: tour.shortForm,
            logoUrl: tour.logoUrl,
          }
        : null,
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
