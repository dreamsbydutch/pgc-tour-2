export const CANADIAN_OPEN_BADGE_LOGO_URL =
  "https://jn9n1jxo7g.ufs.sh/f/3f3580a5-8a7f-4bc3-a16c-53188869acb2-x8pl2f.png";

export function isCanadianOpenTournament(
  name: string | null | undefined,
): boolean {
  return (name ?? "").trim().toLowerCase().includes("canadian open");
}

export function resolveChampionBadgeLogoUrl(
  tournamentName: string | null | undefined,
  tournamentLogoUrl: string | null | undefined,
): string | undefined {
  return isCanadianOpenTournament(tournamentName)
    ? CANADIAN_OPEN_BADGE_LOGO_URL
    : (tournamentLogoUrl ?? undefined);
}
