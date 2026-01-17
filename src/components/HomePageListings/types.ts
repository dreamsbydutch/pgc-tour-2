/**
 * HomePageListings - Type definitions
 */

/**
 * Base tournament information
 */
export interface BaseTournament {
  id: string;
  name: string;
  logoUrl: string | null;
  startDate: Date;
  seasonId: string;
  currentRound: number | null;
}

/**
 * Base tour card information
 */
export interface BaseTourCard {
  id: string;
  displayName: string;
  memberId: string;
  tourId: string;
}

/**
 * Base member information
 */
export interface BaseMember {
  id: string;
  firstname: string | null;
  lastname: string | null;
  email: string;
}

/**
 * Base team information
 */
export interface BaseTeam {
  id: number;
  tournamentId: string;
  tourCardId: string;
  score: number | null;
  position: string | null;
  thru: number | null;
}

/**
 * Base tour information
 */
export interface BaseTour {
  id: string;
  name: string;
  logoUrl: string | null;
}

/**
 * Season standings tour card with aggregated season data
 */
export interface StandingsTourCard extends BaseTourCard {
  totalPoints: number;
  seasonEarnings: number;
  totalWins: number;
  totalTop10s: number;
  averageScore: number | null;
  rank: number;
  member: BaseMember;
  tour: BaseTour;
  recentTournaments?: {
    tournament: BaseTournament;
    position: string | null;
    score: number | null;
    points: number | null;
    earnings: number | null;
  }[];
}

/**
 * Standings data grouped by tour
 */
export interface StandingsData {
  tours: {
    tour: BaseTour;
    tourCards: StandingsTourCard[];
  }[];
}

/**
 * Live tournament team data
 */
export interface LeaderboardTeam extends BaseTeam {
  tourCard: BaseTourCard & {
    member: BaseMember;
    tour: BaseTour;
  };
  golfers: {
    id: number;
    playerName: string;
    position: string | null;
    score: number | null;
    thru: number | null;
    isSelected: boolean;
  }[];
}

/**
 * Leaderboard data grouped by tour
 */
export interface LeaderboardData {
  tournament: BaseTournament;
  tours: {
    tour: BaseTour;
    teams: LeaderboardTeam[];
  }[];
}

/**
 * View type options for HomePageListings
 */
export type HomePageListingsViewType = "standings" | "leaderboard";

/**
 * Configuration for HomePageListings display
 */
export interface HomePageListingsConfig {
  activeView: HomePageListingsViewType;
  maxTeamsDisplay: number;
  enableTourFiltering: boolean;
  showRecentTournaments: boolean;
}
