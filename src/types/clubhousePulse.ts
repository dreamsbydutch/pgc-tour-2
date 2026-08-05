import type { FunctionReturnType } from "convex/server";

import type { api } from "convex/_generated/api";
import type { LeaderboardStandingsSnapshot } from "./leaderboardStandings";
import type { PgcLeaderboardTeam, TournamentShell } from "./tournament";

export type ClubhousePulseDto = FunctionReturnType<
  typeof api.functions.home.getViewerClubhousePulse
>;

export type ClubhousePulseReadyDto = Extract<
  ClubhousePulseDto,
  { kind: "ready" }
>;
export type ClubhousePulseCardDto = ClubhousePulseReadyDto["cards"][number];
export type ClubhousePulseTeamDto =
  ClubhousePulseReadyDto["activeCompetitions"][number]["teams"][number];
export type ClubhousePulseStandingsRowDto =
  ClubhousePulseReadyDto["standingsByTour"][number]["rows"][number];

export type ClubhousePulsePhase =
  | "live"
  | "picks_open"
  | "between_events"
  | "season_complete";

export type ClubhousePulseDestination =
  | "leaderboard"
  | "picks"
  | "standings"
  | "result";

export type ClubhousePulseStoryKind =
  | "movement"
  | "rival"
  | "season"
  | "result";

export interface ClubhousePulseTab {
  cardId: string;
  label: string;
  tourName: string;
}

export interface ClubhousePulseStat {
  label: string;
  value: string;
  accessibleLabel: string;
}

export interface ClubhousePulseStory {
  kind: ClubhousePulseStoryKind;
  text: string;
}

export interface ClubhousePulseStandingSnapshot {
  position: string;
  points: number;
  destination: "gold" | "silver" | "out";
}

export interface ClubhousePulseAction {
  label: string;
  destination: ClubhousePulseDestination;
  tournamentId?: string;
  tourId?: string;
  variant?: "regular" | "playoff";
  season?: string;
}

export interface ClubhousePulseCardViewModel {
  cardId: string;
  tourId: string;
  phase: ClubhousePulsePhase;
  eyebrow: string;
  title: string;
  headline: string;
  summary: string;
  statusLabel: string;
  isLive: boolean;
  stats: [ClubhousePulseStat, ClubhousePulseStat, ClubhousePulseStat];
  stories: ClubhousePulseStory[];
  officialStanding: ClubhousePulseStandingSnapshot | null;
  projectedStanding: ClubhousePulseStandingSnapshot | null;
  action: ClubhousePulseAction;
  actionHint: string;
  secondaryAction: ClubhousePulseAction | null;
  lastUpdatedAt: number | null;
}

export interface ClubhousePulseRivalCandidate {
  id: string;
  memberId?: string | null;
  displayName?: string | null;
  position?: string | null;
  value: number;
}

export interface ClubhousePulseRival {
  candidate: ClubhousePulseRivalCandidate;
  gap: number;
  relation: "ahead" | "behind" | "tied";
  isFriend: boolean;
}

export interface ClubhousePulseCutoff {
  destination: "gold" | "silver" | "out";
  message: string;
}

export interface BuildClubhousePulseCardsArgs {
  data: ClubhousePulseReadyDto;
  friendIds: readonly string[];
  now: number;
}

export type ClubhousePulseModel =
  | { kind: "idle" | "loading" | "empty" }
  | {
      kind: "ready";
      freshness: "live" | "stale";
      tabs: ClubhousePulseTab[];
      selectedCardId: string;
      card: ClubhousePulseCardViewModel;
      selectCard: (cardId: string) => void;
      activateAction: (destination?: ClubhousePulseDestination) => void;
    };

export interface TournamentPulseStripModel {
  position: string;
  score: string;
  movement: string;
  rival: string | null;
  seasonProjection: string | null;
  terminal: "CUT" | "WD" | "DQ" | null;
  jumpToTeam: () => void;
}

export interface UseTournamentPulseStripArgs {
  tournament: TournamentShell;
  activeTourId: string;
  variant: "regular" | "playoff";
  teams: Array<PgcLeaderboardTeam & { posChange: number }>;
  currentTourCardId?: string | null;
  viewerMemberId?: string | null;
  friendIds: ReadonlySet<string>;
  standingsSnapshots: ReadonlyMap<string, LeaderboardStandingsSnapshot>;
}
