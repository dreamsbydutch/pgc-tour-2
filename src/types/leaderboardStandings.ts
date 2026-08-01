export type PlayoffDestination = "gold" | "silver" | "out";

export interface StandingsSnapshotValue {
  position: string;
  points: number;
  destination: PlayoffDestination;
}

export interface LeaderboardStandingsSnapshot {
  tourCardId: string;
  beforeTournament: StandingsSnapshotValue & {
    startingStrokes: number | null;
  };
  live:
    | (StandingsSnapshotValue & {
        startingStrokes: number | null;
      })
    | null;
  lastUpdatedAt: number | null;
}

export interface StandingsProjectionTour {
  id: string;
  playoffSpots: readonly number[];
}

export interface StandingsProjectionTourCard {
  id: string;
  tourId: string;
  points: number;
}

export interface StandingsProjectionTeam {
  tourCardId: string;
  points?: number | null;
}

export interface PlayoffStartingStrokeCard {
  id: string;
  points: number;
}

export interface BuildLeaderboardStandingsProjectionArgs {
  tournamentStatus?: "upcoming" | "active" | "completed" | "cancelled";
  isPlayoff: boolean;
  lastUpdatedAt?: number | null;
  tours: StandingsProjectionTour[];
  tourCards: StandingsProjectionTourCard[];
  teams: StandingsProjectionTeam[];
}

export interface LeaderboardStandingsCardProps {
  snapshot: LeaderboardStandingsSnapshot;
}

export interface StandingsSnapshotColumnProps {
  label: string;
  value: StandingsSnapshotValue;
  startingStrokes?: number | null;
}

export interface UseLeaderboardStandingsProjectionArgs {
  tournament: {
    status?: "upcoming" | "active" | "completed" | "cancelled";
    isPlayoff?: boolean;
    leaderboardLastUpdatedAt?: number;
  };
  variant: "regular" | "playoff";
  tours: Array<{
    _id: string;
    playoffSpots: number[];
  }>;
  tourCards?: Array<{
    _id: string;
    tourId: string;
    points: number;
  }>;
  teams: Array<{
    tourCardId: string;
    points?: number | null;
  }>;
}
