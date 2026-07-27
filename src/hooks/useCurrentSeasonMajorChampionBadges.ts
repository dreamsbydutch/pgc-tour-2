"use client";

import { api, useQuery } from "@/convex";
import type { MajorChampionBadge, MajorChampionBadgesByMemberId } from "@/lib";
export type { MajorChampionBadge, MajorChampionBadgesByMemberId } from "@/lib";

export function filterMajorChampionBadges(args: {
  badges?: MajorChampionBadge[] | null;
  hiddenTournamentIds?: Iterable<string> | null;
}): MajorChampionBadge[] {
  const badges = args.badges ?? [];
  const hiddenTournamentIds = new Set(args.hiddenTournamentIds ?? []);

  if (hiddenTournamentIds.size === 0) {
    return badges;
  }

  return badges.filter((badge) => !hiddenTournamentIds.has(badge.tournamentId));
}

export function filterMajorChampionBadgesByMemberId(args: {
  badgesByMemberId: MajorChampionBadgesByMemberId;
  hiddenTournamentIds?: Iterable<string> | null;
}): MajorChampionBadgesByMemberId {
  const hiddenTournamentIds = new Set(args.hiddenTournamentIds ?? []);

  if (hiddenTournamentIds.size === 0) {
    return args.badgesByMemberId;
  }

  return Object.entries(
    args.badgesByMemberId,
  ).reduce<MajorChampionBadgesByMemberId>((accumulator, [memberId, badges]) => {
    accumulator[memberId] = filterMajorChampionBadges({
      badges,
      hiddenTournamentIds,
    });
    return accumulator;
  }, {});
}

export function useCurrentSeasonMajorChampionBadges(): MajorChampionBadgesByMemberId {
  return useQuery(api.functions.seasons.getMajorChampionBadgesReadModel) ?? {};
}
