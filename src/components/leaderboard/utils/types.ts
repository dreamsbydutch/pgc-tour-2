/**
 * Types for Leaderboard components
 * Adapted for Convex backend integration
 */

import type { Doc, Id } from "../../../../convex/_generated/dataModel";
export type LeaderboardTournament = Doc<"tournaments"> & {
  tier?: Doc<"tiers"> | null;
  course?: Doc<"courses"> | null;
};

export type LeaderboardGolfer = Doc<"golfers"> & {
  position?: string | null;
  posChange?: number | null;
  score?: number | null;
  today?: number | null;
  thru?: number | null;
  group?: number | null;
  roundOne?: number | null;
  roundTwo?: number | null;
  roundThree?: number | null;
  roundFour?: number | null;
  round?: number | null;
  rating?: number | null;
  endHole?: number | null;
  usage?: number | null;
  makeCut?: number | null;
  topTen?: number | null;
  win?: number | null;
  worldRank?: number | null;
  roundOneTeeTime?: string | null;
  roundTwoTeeTime?: string | null;
  roundThreeTeeTime?: string | null;
  roundFourTeeTime?: string | null;
};

export type LeaderboardTeam = Doc<"teams"> & {
  pastPosition?: string | null;
  position?: string | null;
  today?: number | null;
  thru?: number | null;
  score?: number | null;
  round?: number | null;
  points?: number | null;
  earnings?: number | null;
  roundOne?: number | null;
  roundTwo?: number | null;
  roundThree?: number | null;
  roundFour?: number | null;
  roundOneTeeTime?: string | null;
  roundTwoTeeTime?: string | null;
  roundThreeTeeTime?: string | null;
  roundFourTeeTime?: string | null;
};

export type LeaderboardTour = Doc<"tours">;

export type LeaderboardTourCard = Doc<"tourCards"> & {
  member?: Doc<"members">;
  tour?: Doc<"tours">;
};

export type LeaderboardMember = Doc<"members">;

export type TeamWithTourCard = LeaderboardTeam & {
  tourCard?: LeaderboardTourCard | null;
  member?: LeaderboardMember | null;
};

export type TourToggle = {
  id: string;
  name: string;
  shortForm: string;
  logoUrl?: string | null;
  teamCount?: number;
};

export interface LeaderboardDataProps {
  tournament: LeaderboardTournament;
  teams: TeamWithTourCard[];
  golfers: LeaderboardGolfer[];
  tours: LeaderboardTour[];
  tourCards: LeaderboardTourCard[];
  member?: LeaderboardMember | null;
  tourCard?: LeaderboardTourCard | null;
  inputTour?: string;
}
export interface LeaderboardDataState {
  props: LeaderboardDataProps | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface LeaderboardLogicState {
  toggleTours: TourToggle[];
  defaultToggle: string;
  isPlayoff: boolean;
  maxPlayoffLevel: number;
}
export interface LeaderboardViewProps {
  /** Tournament ID to display leaderboard for */
  tournamentId: Id<"tournaments">;
  /** Leaderboard variant type */
  variant?: "regular" | "playoff" | "historical";
  /** Optional tour ID from external source */
  inputTour?: string;
  /** Whether this is pre-tournament display */
  isPreTournament?: boolean;
  /** Callback fired when data is refetched */
  onRefetch?: () => void;
}

export interface PGCLeaderboardProps {
  /** Teams to display in the leaderboard */
  teams: TeamWithTourCard[];
  /** All golfers in the tournament */
  golfers: LeaderboardGolfer[];
  /** Tournament information */
  tournament: LeaderboardTournament;
  /** Current user's tour card for highlighting */
  tourCard?: LeaderboardTourCard | null;
  /** Member data for friend highlighting */
  member?: LeaderboardMember | null;
  /** Currently active tour ID */
  activeTour: string;
  /** Leaderboard variant type */
  variant: "regular" | "playoff";
  /** Whether tournament hasn't started yet */
  isPreTournament?: boolean;
}

export interface PGALeaderboardProps {
  /** All golfers in the tournament */
  golfers: LeaderboardGolfer[];
  /** Tournament information */
  tournament: LeaderboardTournament;
  /** Whether tournament hasn't started yet */
  isPreTournament?: boolean;
}

export interface PlayoffLeaderboardProps {
  /** Teams to display in the leaderboard */
  teams: TeamWithTourCard[];
  /** All golfers in the tournament */
  golfers: LeaderboardGolfer[];
  /** Tournament information */
  tournament: LeaderboardTournament;
  /** Current user's tour card for highlighting */
  tourCard?: LeaderboardTourCard | null;
  /** Member data for friend highlighting */
  member?: LeaderboardMember | null;
  /** Currently active tour ID */
  activeTour: string;
  /** Maximum playoff level to display */
  maxLevel?: number;
  /** Whether tournament hasn't started yet */
  isPreTournament?: boolean;
}
