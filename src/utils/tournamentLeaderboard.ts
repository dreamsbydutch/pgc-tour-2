export type TournamentLeaderboardVariant = "regular" | "playoff";

export type TournamentLeaderboardToggle = {
  _id: string;
  shortForm: string;
  logoUrl?: string | null;
};

export function getTournamentLeaderboardVariant(
  tournament: { isPlayoff?: boolean } | null | undefined,
): TournamentLeaderboardVariant {
  return tournament?.isPlayoff === true ? "playoff" : "regular";
}

export function getTournamentLeaderboardToggles(args: {
  variant: TournamentLeaderboardVariant;
  tours: TournamentLeaderboardToggle[];
  pgaLogoUrl: string;
}): TournamentLeaderboardToggle[] {
  const pga = {
    _id: "pga",
    shortForm: "PGA",
    logoUrl: args.pgaLogoUrl,
  };
  if (args.variant === "playoff") {
    return [
      { _id: "gold", shortForm: "Gold" },
      { _id: "silver", shortForm: "Silver" },
      pga,
    ];
  }
  return [...args.tours, pga];
}

export function getActiveTournamentLeaderboardId(args: {
  variant: TournamentLeaderboardVariant;
  requestedTourId?: string;
  viewerTourId?: string;
  viewerPlayoff?: number;
  tours: Array<{ _id: string }>;
}): string {
  if (args.variant === "playoff") {
    if (["gold", "silver", "pga"].includes(args.requestedTourId ?? "")) {
      return args.requestedTourId!;
    }
    return args.viewerPlayoff === 2 ? "silver" : "gold";
  }

  const tourIds = new Set(args.tours.map((tour) => String(tour._id)));
  if (
    args.requestedTourId === "pga" ||
    (args.requestedTourId && tourIds.has(args.requestedTourId))
  ) {
    return args.requestedTourId;
  }
  if (args.viewerTourId && tourIds.has(args.viewerTourId)) {
    return args.viewerTourId;
  }
  return args.tours[0] ? String(args.tours[0]._id) : "pga";
}
