import type { LeaderboardPgaRow, LeaderboardTeamRow } from "./types";

const SCORE_PENALTIES = {
  DQ: 999,
  WD: 888,
  CUT: 444,
} as const;

export function isPlayerCut(position: string | null | undefined): boolean {
  return position === "CUT" || position === "WD" || position === "DQ";
}

function calculateScoreForSorting(
  position: string | null | undefined,
  score: number | null | undefined,
): number {
  if (position === "DQ") return SCORE_PENALTIES.DQ + (score ?? 999);
  if (position === "WD") return SCORE_PENALTIES.WD + (score ?? 999);
  if (position === "CUT") return SCORE_PENALTIES.CUT + (score ?? 999);
  return score ?? 999;
}

export function getPositionChangeForTeam(team: {
  pastPosition: string | null;
  position: string | null;
}): number {
  if (!team.pastPosition || !team.position) return 0;
  return (
    Number(team.pastPosition.replace("T", "")) -
    Number(team.position.replace("T", ""))
  );
}

export function sortPgaRows(rows: LeaderboardPgaRow[]): LeaderboardPgaRow[] {
  const nonCut = rows.filter((r) => !isPlayerCut(r.position));
  const cut = rows.filter((r) => isPlayerCut(r.position));

  nonCut.sort(
    (a, b) =>
      calculateScoreForSorting(a.position, a.score) -
      calculateScoreForSorting(b.position, b.score),
  );

  cut
    .sort(
      (a, b) =>
        calculateScoreForSorting(a.position, a.score) -
        calculateScoreForSorting(b.position, b.score),
    )
    .sort((a, b) => (a.group ?? 999) - (b.group ?? 999))
    .sort((a, b) => (a.position ?? "").localeCompare(b.position ?? ""));

  return [...nonCut, ...cut];
}

export function sortTeamRows(rows: LeaderboardTeamRow[]): LeaderboardTeamRow[] {
  const next = [...rows];
  next
    .sort((a, b) => (a.thru ?? 0) - (b.thru ?? 0))
    .sort(
      (a, b) =>
        calculateScoreForSorting(a.position, a.score) -
        calculateScoreForSorting(b.position, b.score),
    );
  return next;
}

export function filterTeamRowsByTour(
  rows: LeaderboardTeamRow[],
  activeTourId: string,
  variant: "regular" | "playoff" | "historical",
): LeaderboardTeamRow[] {
  const sorted = sortTeamRows(rows);

  if (variant === "playoff") {
    const playoffLevel =
      activeTourId === "gold" ? 1 : activeTourId === "silver" ? 2 : 1;
    return sorted.filter((t) => (t.tourCard.playoff ?? 0) === playoffLevel);
  }

  return sorted.filter((t) => (t.tourCard.tourId ?? "") === activeTourId);
}

export function getLeaderboardRowClass(args: {
  type: "PGC" | "PGA";
  isCut: boolean;
  isUser: boolean;
  isFriend: boolean;
}): string {
  const classes = [
    "col-span-10 grid grid-flow-row grid-cols-10 py-0.5 sm:grid-cols-33",
  ];

  if (args.type === "PGC") {
    if (args.isUser) classes.push("bg-slate-200 font-semibold");
    else if (args.isFriend) classes.push("bg-slate-100");
    if (args.isCut) classes.push("text-gray-400");
  }

  if (args.type === "PGA") {
    if (args.isUser) classes.push("bg-slate-100");
    if (args.isCut) classes.push("text-gray-400");
  }

  return classes.join(" ");
}
