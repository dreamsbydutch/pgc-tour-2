/**
 * TypeScript type definitions for StandingsView component
 * Adapted for Convex backend integration
 */

import type { Id } from "../../../../convex/_generated/dataModel";

/**
 * Member from Convex database
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
 * Season from Convex database
 */
export interface Season {
  _id: Id<"seasons">;
  oldId?: string;
  year: number;
  number: number;
  name?: string;
  startDate?: number;
  endDate?: number;
  registrationDeadline?: number;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * Tour from Convex database
 */
export interface Tour {
  _id: Id<"tours">;
  _creationTime: number;
  oldId?: string;
  name: string;
  shortForm: string;
  logoUrl: string;
  seasonId: Id<"seasons">;
  buyIn: number;
  playoffSpots: number[];
  maxParticipants?: number;
  description?: string;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * TourCard from Convex database
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
 * Tournament from Convex database
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
 * Team from Convex database
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
 * Extended TourCard with computed properties for standings display
 */
export interface ExtendedTourCard extends TourCard {
  /** Member information */
  member?: Member;
  /** Tour information */
  tour?: Tour;
  /** Previous points total (for change calculation) */
  pastPoints?: number;
  /** Position change from previous period */
  posChange?: number;
  /** Position change for playoff qualification */
  posChangePO?: number;
  /** Current position in standings (numeric rank) */
  standingsPosition?: number;
  /** Whether this member is a friend */
  isFriend?: boolean;
}

/**
 * Tour with associated tour cards
 */
export interface TourWithCards extends Tour {
  /** Tour cards associated with this tour */
  tourCards?: ExtendedTourCard[];
}

/**
 * Champion team with included tournament data
 */
export interface Champion {
  /** Team ID */
  _id: Id<"teams">;
  /** Associated tour card ID */
  tourCardId: Id<"tourCards">;
  /** Tournament ID */
  tournamentId: Id<"tournaments">;
  /** Final position (usually "1" or "T1" for champions) */
  position: string | null;
  /** Earnings from this tournament */
  earnings: number | null;
  /** Points earned from this tournament */
  points: number | null;
  /** Tournament information */
  tournament?: {
    /** Tournament name */
    name: string;
    /** Tournament logo URL */
    logoUrl: string | null;
    /** Tournament start date */
    startDate: number;
    /** Current round number */
    currentRound: number | null;
  };
}

/**
 * Complete standings data structure returned from hooks
 */
export interface StandingsData {
  /** All available tours */
  tours: Tour[];
  /** All tour cards with computed properties */
  tourCards: ExtendedTourCard[];
  /** Current user's tour card */
  currentTourCard: ExtendedTourCard | null;
  /** Current user's member information */
  currentMember: Member | null;
  /** All teams for the season */
  teams: Team[];
  /** All tournaments for the season */
  tournaments: Tournament[];
  /** Current season information */
  currentSeason: Season | null;
}

/**
 * Standings state with loading and error handling
 */
export interface StandingsState {
  /** Data payload (null when loading or error) */
  data: StandingsData | null;
  /** Whether data is currently being fetched */
  isLoading: boolean;
  /** Error object if fetch failed */
  error: Error | null;
}

/**
 * State for friend management operations
 */
export interface FriendManagementState {
  /** Set of member IDs currently being updated */
  friendChangingIds: Set<string>;
  /** Whether any friend operation is in progress */
  isUpdating: boolean;
}

/**
 * Actions for friend management
 */
export interface FriendManagementActions {
  /** Add a friend by member ID */
  addFriend: (memberId: string) => Promise<void>;
  /** Remove a friend by member ID */
  removeFriend: (memberId: string) => Promise<void>;
}

/**
 * Complete friend management hook return
 */
export interface FriendManagementHook {
  /** Current friend management state */
  state: FriendManagementState;
  /** Available friend management actions */
  actions: FriendManagementActions;
}

/**
 * Props for the main StandingsView component
 */
export interface StandingsViewProps {
  /** Optional initial tour ID to display */
  initialTourId?: string;
}

/**
 * Props for StandingsContent component
 */
export interface StandingsContentProps {
  /** Currently selected tour toggle */
  standingsToggle: string;
  /** Complete standings data */
  data: StandingsData;
  friendsOnly: boolean;
  setFriendsOnly: (value: boolean) => void;
  disabled?: boolean;
  /** Friend management state */
  friendState: FriendManagementState;
  /** Function to add a friend */
  onAddFriend: (memberId: string) => Promise<void>;
  /** Function to remove a friend */
  onRemoveFriend: (memberId: string) => Promise<void>;
}

/**
 * Props for TourStandings component (regular tour display)
 */
export interface TourStandingsProps {
  /** Tour information */
  tour: Tour;
  /** Tour cards to display */
  tourCards: ExtendedTourCard[];
  /** Current user's member info */
  currentMember: Member | null;
  /** Friend management state */
  friendState: FriendManagementState;
  friendsOnly: boolean;
  setFriendsOnly: (value: boolean) => void;
  disabled?: boolean;
  /** Function to add a friend */
  onAddFriend: (memberId: string) => Promise<void>;
  /** Function to remove a friend */
  onRemoveFriend: (memberId: string) => Promise<void>;
}

/**
 * Props for PlayoffStandings component
 */
export interface PlayoffStandingsProps {
  /** All available tours */
  tours: Tour[];
  /** Tour cards to display */
  tourCards: ExtendedTourCard[];
  /** Current user's member info */
  currentMember: Member | null;
  friendsOnly: boolean;
  setFriendsOnly: (value: boolean) => void;
  disabled?: boolean;
  /** Friend management state */
  friendState: FriendManagementState;
  /** Function to add a friend */
  onAddFriend: (memberId: string) => Promise<void>;
  /** Function to remove a friend */
  onRemoveFriend: (memberId: string) => Promise<void>;
}

/**
 * Props for individual StandingsListing component
 */
export interface StandingsListingProps {
  /** Tour card to display */
  tourCard: ExtendedTourCard;
  /** Display variant */
  variant: "regular" | "playoff" | "bumped";
  /** Current user's member info */
  currentMember?: Member | null;
  /** Whether this friend is currently being updated */
  isFriendChanging?: boolean;
  /** Function to add a friend */
  onAddFriend?: (memberId: string) => void;
  /** Function to remove a friend */
  onRemoveFriend?: (memberId: string) => void;

  /** Team information for playoff display */
  teams?: ExtendedTourCard[];
  /** Stroke information */
  strokes?: number[];
  /** Tour information */
  tour?: Tour;
}

/**
 * Props for StandingsHeader component
 */
export interface StandingsHeaderProps {
  /** Currently selected tour toggle */
  standingsToggle: string;
  /** Currently displayed tour info */
  displayedTour?: Tour;
}

/**
 * Props for ToursToggle component
 */
export interface ToursToggleProps {
  /** Available tours to toggle between */
  tours: Tour[];
  /** Currently selected tour */
  standingsToggle: string;
  /** Function to change tour selection */
  setStandingsToggle: (tourId: string) => void;
}

/**
 * Props for StandingsError component
 */
export interface StandingsErrorProps {
  /** Error message to display */
  error: string;
  /** Function to retry loading */
  onRetry: () => void;
}

/**
 * Grouped standings for regular tour view
 */
export interface StandingsGroups {
  /** Tour cards qualified for gold playoffs (positions 1-15) */
  goldCutCards: ExtendedTourCard[];
  /** Tour cards qualified for silver playoffs (positions 16-35) */
  silverCutCards: ExtendedTourCard[];
  /** Remaining tour cards (positions 36+) */
  remainingCards: ExtendedTourCard[];
}

/**
 * Grouped standings for playoff view
 */
export interface PlayoffGroups {
  /** Teams qualified for gold playoffs */
  goldTeams: ExtendedTourCard[];
  /** Teams qualified for silver playoffs */
  silverTeams: ExtendedTourCard[];
  /** Teams that were bumped into playoffs */
  bumpedTeams: ExtendedTourCard[];
}
