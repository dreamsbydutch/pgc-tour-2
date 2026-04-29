"use client";

import { api, useQuery } from "@/convex";

export type MajorChampionBadge = {
  tournamentId: string;
  tournamentName: string;
  logoUrl: string | null;
};

export type MajorChampionBadgesByMemberId = Record<
  string,
  MajorChampionBadge[]
>;

export function useCurrentSeasonMajorChampionBadges(): MajorChampionBadgesByMemberId {
  return (
    useQuery(api.functions.seasons.getCurrentSeasonMajorChampionBadges) ?? {}
  );
}
