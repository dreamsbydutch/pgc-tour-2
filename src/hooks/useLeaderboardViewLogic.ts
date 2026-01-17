import { useMemo } from "react";

import type {
  LeaderboardTourToggle,
  LeaderboardVariant,
  LeaderboardViewModel,
} from "@/components/leaderboardView/utils/types";

const PLAYOFF_TOGGLES: LeaderboardTourToggle[] = [
  {
    id: "gold",
    shortForm: "Gold",
    name: "Gold",
    logoUrl: "https://dv1agvszuv2ff.cloudfront.net/tourLogos/gold.webp",
  },
  {
    id: "silver",
    shortForm: "Silver",
    name: "Silver",
    logoUrl: "https://dv1agvszuv2ff.cloudfront.net/tourLogos/silver.webp",
  },
  { id: "pga", shortForm: "PGA", name: "PGA", logoUrl: null },
];

function isPlayoffTierName(tierName: string | null): boolean {
  if (!tierName) return false;
  return tierName.toLowerCase().includes("playoff");
}

/**
 * Computes tournament leaderboard UI state (variant, tour toggles, default toggle).
 */
export function useLeaderboardViewLogic(args: {
  model: LeaderboardViewModel;
  tours: Array<{
    _id: string;
    name: string;
    shortForm: string;
    logoUrl: string;
  }>;
  tierName: string | null;
  variantOverride?: LeaderboardVariant | null;
}) {
  const variant = useMemo<LeaderboardVariant>(() => {
    if (args.variantOverride) return args.variantOverride;
    return isPlayoffTierName(args.tierName) ? "playoff" : "regular";
  }, [args.variantOverride, args.tierName]);

  const maxPlayoffLevel = useMemo<number>(() => {
    if (args.model.kind !== "ready") return 0;
    if (variant !== "playoff") return 0;

    let max = 0;
    for (const team of args.model.pgcRows) {
      const level = team.tourCard.playoff ?? 0;
      if (level > max) max = level;
    }
    return max;
  }, [args.model, variant]);

  const toggleTours = useMemo<LeaderboardTourToggle[]>(() => {
    if (args.model.kind !== "ready") return [];

    if (variant === "playoff") {
      if (maxPlayoffLevel <= 1) {
        return [PLAYOFF_TOGGLES[0], PLAYOFF_TOGGLES[2]];
      }
      return PLAYOFF_TOGGLES;
    }

    const teamTourIds = new Set(
      args.model.pgcRows
        .map((t) => t.tourCard.tourId)
        .filter((x): x is string => Boolean(x)),
    );

    const tourToggles: LeaderboardTourToggle[] = args.tours
      .filter((t) => teamTourIds.has(t._id))
      .map((t) => ({
        id: t._id,
        shortForm: t.shortForm,
        name: t.name,
        logoUrl: t.logoUrl,
      }));

    return [
      ...tourToggles,
      { id: "pga", shortForm: "PGA", name: "PGA", logoUrl: null },
    ];
  }, [args.model, args.tours, variant, maxPlayoffLevel]);

  const defaultTourId = useMemo<string>(() => {
    if (toggleTours.length === 0) return "pga";

    const firstNonPga = toggleTours.find((t) => t.id !== "pga");
    return (firstNonPga ?? toggleTours[0]).id;
  }, [toggleTours]);

  return {
    variant,
    isPlayoff: variant === "playoff",
    maxPlayoffLevel,
    toggleTours,
    defaultTourId,
  };
}
