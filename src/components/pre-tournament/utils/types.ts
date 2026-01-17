/**
 * TypeScript type definitions for PreTournament components
 * Adapted for Convex backend integration
 */

import type { Id } from "../../../../convex/_generated/dataModel";

/**
 * Tournament from Convex database (extended from standings types)
 */
export interface Tournament {
  _id: Id<"tournaments">;
  oldId?: string;
  name: string;
  startDate: number;
  endDate: number;
  tierId: Id<"tiers">;
  courseId: Id<"courses">;
  seasonId: Id<"seasons">;
  logoUrl?: string;
  apiId?: string;
  status?: "upcoming" | "active" | "completed" | "cancelled";
  currentRound?: number;
  livePlay?: boolean;
  description?: string;
  registrationDeadline?: number;
  maxTeams?: number;
  tourIds?: Id<"tours">[];
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Team from Convex database (extended from standings types)
 */
export interface Team {
  _id: Id<"teams">;
  oldId?: string;
  tournamentId: Id<"tournaments">;
  tourCardId: Id<"tourCards">;
  golferIds: number[];
  teamName?: string;
  earnings?: number;
  points?: number;
  makeCut?: number;
  position?: string;
  pastPosition?: string;
  score?: number;
  topTen?: number;
  topFive?: number;
  topThree?: number;
  win?: number;
  today?: number;
  thru?: number;
  round?: number;
  roundOneTeeTime?: string;
  roundOne?: number;
  roundTwoTeeTime?: string;
  roundTwo?: number;
  roundThreeTeeTime?: string;
  roundThree?: number;
  roundFourTeeTime?: string;
  roundFour?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Member from Convex database (extended from standings types)
 */
export interface Member {
  _id: Id<"members">;
  clerkId?: string;
  email: string;
  firstname?: string;
  lastname?: string;
  displayName?: string;
  role: "admin" | "moderator" | "regular";
  account: number;
  friends: (string | Id<"members">)[];
  lastLoginAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * TourCard from Convex database (extended from standings types)
 */
export interface TourCard {
  _id: Id<"tourCards">;
  oldId?: string;
  clerkId?: string;
  displayName: string;
  tourId: Id<"tours">;
  seasonId: Id<"seasons">;
  earnings: number;
  points: number;
  wins?: number;
  topTen: number;
  topFive?: number;
  madeCut: number;
  appearances: number;
  playoff?: number;
  currentPosition?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Golfer from Convex database (for team selection)
 */
export interface Golfer {
  _id?: Id<"golfers">;
  apiId: number;
  playerName: string;
  worldRank?: number;
  rating?: number;
  group?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Tier from Convex database (for tournament tier information)
 */
export interface Tier {
  _id: Id<"tiers">;
  oldId?: string;
  name: string;
  seasonId: Id<"seasons">;
  payouts: number[];
  points: number[];
  minimumParticipants?: number;
  maximumParticipants?: number;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Extended Tournament with tier information
 */
export interface ExtendedTournament extends Tournament {
  tier?: Tier;
}

/**
 * Extended Team with golfer information
 */
export interface ExtendedTeam extends Team {
  golfers?: Golfer[];
}

/**
 * Props for the main PreTournament component
 */
export interface PreTournamentProps {
  tournamentId: string;
}

/**
 * Props for PreTournamentContent component
 */
export interface PreTournamentContentProps {
  tournament: ExtendedTournament;
  member?: Member | null;
  tourCard?: TourCard | null;
  existingTeam?: ExtendedTeam | null;
  teamGolfers?: Golfer[];
  playoffEventIndex?: number;
}

/**
 * Props for TeamPickForm component
 */
export interface TeamPickFormProps {
  tournament: ExtendedTournament;
  member: Member;
  tourCard: TourCard;
  existingTeam?: ExtendedTeam | null;
  teamGolfers?: Golfer[];
}

/**
 * Props for MemberHeader component
 */
export interface MemberHeaderProps {
  member: Member;
}

/**
 * Props for TeamGolfersList component
 */
export interface TeamGolfersListProps {
  golfers: Golfer[];
}

/**
 * Complete pre-tournament data structure
 */
export interface PreTournamentData {
  tournament: ExtendedTournament | null;
  member: Member | null;
  tourCard: TourCard | null;
  existingTeam: ExtendedTeam | null;
  teamGolfers: Golfer[];
  playoffEventIndex: number;
  allTournaments: Tournament[];
}

/**
 * Pre-tournament state with loading and error handling
 */
export interface PreTournamentState {
  data: PreTournamentData | null;
  isLoading: boolean;
  error: Error | null;
}
