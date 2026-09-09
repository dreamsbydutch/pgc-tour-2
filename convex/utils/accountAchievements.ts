export type AccountAchievementKind =
  | "pgcChampion"
  | "silverChampion"
  | "major"
  | "tournament";

export function getAccountAchievementHonor(args: {
  isPlayoff: boolean;
  playoffLevel: number | undefined;
  tierName: string;
}): {
  kind: AccountAchievementKind;
  label: string;
  priority: number;
} {
  if (args.isPlayoff) {
    return args.playoffLevel === 2
      ? { kind: "silverChampion", label: "Silver Champion", priority: 1 }
      : { kind: "pgcChampion", label: "PGC Champion", priority: 0 };
  }

  if (args.tierName.trim().toLowerCase() === "major") {
    return { kind: "major", label: "Major Champion", priority: 2 };
  }

  return { kind: "tournament", label: "Tournament Champion", priority: 3 };
}
