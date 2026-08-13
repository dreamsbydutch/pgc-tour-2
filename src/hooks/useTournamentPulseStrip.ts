import { useCallback, useMemo } from "react";

import type {
  TournamentPulseStripModel,
  UseTournamentPulseStripArgs,
} from "@/types";
import {
  getTerminalScoreState,
  selectClubhousePulseRival,
} from "@/utils/clubhousePulse";
import { formatScore } from "@/utils/app";
import { useAnalytics } from "./useAnalytics";

export function useTournamentPulseStrip(
  args: UseTournamentPulseStripArgs,
): TournamentPulseStripModel | null {
  const { trackClubhousePulseCtaClicked } = useAnalytics();
  const viewerTeam = useMemo(
    () =>
      args.teams.find(
        (team) =>
          args.currentTourCardId &&
          String(team.tourCardId) === args.currentTourCardId,
      ) ??
      args.teams.find(
        (team) =>
          args.viewerMemberId && String(team.memberId) === args.viewerMemberId,
      ),
    [args.currentTourCardId, args.teams, args.viewerMemberId],
  );
  const jumpToTeam = useCallback(() => {
    if (!viewerTeam) return;
    const target = document.getElementById(
      getTournamentPulseRowId(String(viewerTeam.tourCardId)),
    );
    if (!target) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    target.focus({ preventScroll: true });
    trackClubhousePulseCtaClicked("live", "leaderboard");
  }, [trackClubhousePulseCtaClicked, viewerTeam]);

  if (
    args.tournament.status !== "active" ||
    args.activeTourId === "pga" ||
    !viewerTeam
  ) {
    return null;
  }
  const terminal = getTerminalScoreState(viewerTeam.position);
  const rival = terminal
    ? null
    : selectClubhousePulseRival({
        viewer: {
          id: String(viewerTeam.tourCardId),
          memberId: viewerTeam.memberId ? String(viewerTeam.memberId) : null,
          displayName: viewerTeam.displayName,
          position: viewerTeam.position,
          value: viewerTeam.score ?? Number.NaN,
        },
        candidates: args.teams
          .filter((team) => !getTerminalScoreState(team.position))
          .map((team) => ({
            id: String(team.tourCardId),
            memberId: team.memberId ? String(team.memberId) : null,
            displayName: team.displayName,
            position: team.position,
            value: team.score ?? Number.NaN,
          })),
        friendIds: [...args.friendIds],
        lowerIsBetter: true,
      });
  const snapshot = args.standingsSnapshots.get(String(viewerTeam.tourCardId));
  return {
    position: viewerTeam.position ?? "—",
    score: terminal ?? formatPulseScore(viewerTeam.score),
    movement: terminal
      ? `${terminal} — movement unavailable`
      : viewerTeam.posChange > 0
        ? `Up ${viewerTeam.posChange}`
        : viewerTeam.posChange < 0
          ? `Down ${Math.abs(viewerTeam.posChange)}`
          : "Holding steady",
    rival: rival
      ? rival.relation === "tied"
        ? `Tied with ${abbreviateName(rival.candidate.displayName)}`
        : `${formatGap(rival.gap)} ${rival.relation} ${abbreviateName(rival.candidate.displayName)}`
      : null,
    seasonProjection:
      args.variant === "playoff"
        ? null
        : snapshot?.live
          ? `${snapshot.live.position} projected · ${capitalize(snapshot.live.destination)}`
          : "Awaiting live projection",
    terminal,
    jumpToTeam,
  };
}

export function getTournamentPulseRowId(tourCardId: string) {
  return `pgc-team-${tourCardId}`;
}

function formatPulseScore(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? formatScore(value)
    : "—";
}

function formatGap(value: number) {
  const gap = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return `${gap} ${Math.abs(value) === 1 ? "stroke" : "strokes"}`;
}

function abbreviateName(value: string | null | undefined) {
  const parts = (value ?? "Rival").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "Rival";
  return `${parts[0]![0]}. ${parts.slice(1).join(" ")}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
