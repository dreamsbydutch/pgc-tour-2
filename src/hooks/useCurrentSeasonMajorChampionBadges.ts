import type {
  MajorChampionBadge,
  MajorChampionBadgesByMemberId,
} from "@/types";
export type {
  MajorChampionBadge,
  MajorChampionBadgesByMemberId,
} from "@/types";

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
