import type { Doc, Id } from "@/convex";
import type { EnhancedTournamentDoc } from "convex/types/types";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Column definition used by `AdminDataTable`.
 */
export type AdminDataTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  headClassName?: string;
  cellClassName?: string;
};

/**
 * Props for ToursToggle component
 */
export interface ToursToggleProps {
  tours: {
    id: string;
    shortForm: string;
    logoUrl?: string | null;
  }[];
  activeTourId: string;
  onChangeTourId: (tourId: string) => void;
  extraToggles?: {
    id: string;
    shortForm: string;
    logoUrl?: string | null;
  }[];
  sort?: boolean;
  loading?: boolean;
}

/**
 * Props for AdminPanel component.
 */
export interface AdminPanelProps {
  loading?: boolean;
}

/**
 * Tournament metadata used by `TournamentCountdown`.
 */
export interface TournamentCountdownTourney {
  name: string;
  logoUrl?: string | null;
  startDate: number;
}

/**
 * Props for `TournamentCountdown`.
 */
export interface TournamentCountdownProps {
  tourney?: TournamentCountdownTourney;
}

/**
 * Props for `TourCardChangeButton`.
 */
export interface TourCardChangeButtonProps {
  tourCardId: Id<"tourCards">;
  loading?: boolean;
}

/**
 * Props for `PointsTable`.
 */
export interface PointsTableProps {
  tiers?: Array<{ key: string; name: string; points: number[] }>;
  loading?: boolean;
}

/**
 * Props for `PayoutsTable`.
 */
export interface PayoutsTableProps {
  tiers?: Array<{ key: string; name: string; payouts: number[] }>;
  loading?: boolean;
}

type TourCardFormButtonLoadedProps = {
  tour: Doc<"tours">;
  spotsRemaining: number;
  seasonId: Id<"seasons">;
  memberDisplayName: string;
  buyInLabel: string;
  isCreatingTourCard: boolean;
  setIsCreatingTourCard: Dispatch<SetStateAction<boolean>>;
  loading?: false;
};

/**
 * Props for `TourCardFormButton`.
 */
export type TourCardFormButtonProps =
  | TourCardFormButtonLoadedProps
  | { loading: true };

export interface ChampionshipWinTournament {
  tournamentId: Id<"tournaments">;
  name: string;
  logoUrl: string | null;
  startDate: number;
  seasonId: Id<"seasons">;
  tierName: string | null;
}

export interface LittleFuckerProps {
  wins?: ChampionshipWinTournament[];
  showSeasonText?: boolean;
  className?: string;
  loading?: boolean;
}

export interface LittleFuckerSkeletonProps {
  showSeasonText?: boolean;
  className?: string;
}

type LeaderboardHeaderLoadedProps = {
  focusTourney: EnhancedTournamentDoc;
  tournaments: EnhancedTournamentDoc[];
  onTournamentChange?: (tournamentId: string) => void;
  loading?: false;
};

/**
 * Props for `LeaderboardHeader`.
 */
export type LeaderboardHeaderProps =
  | LeaderboardHeaderLoadedProps
  | { loading: true };

export type LeaderboardHeaderGroupMode = "schedule" | "tier";

type LeaderboardHeaderDropdownLoadedProps = {
  activeTourney: EnhancedTournamentDoc;
  tournaments: EnhancedTournamentDoc[];
  onSelect?: (tournamentId: string) => void;
  className?: string;
  loading?: false;
};

/**
 * Props for `LeaderboardHeaderDropdown`.
 */
export type LeaderboardHeaderDropdownProps =
  | LeaderboardHeaderDropdownLoadedProps
  | { loading: true; className?: string };

/**
 * Props for `LeagueSchedule`.
 */
export interface LeagueScheduleProps {
  seasonId?: Id<"seasons">;
  loading?: boolean;
}

/**
 * View options for `HomePageListingsContainer`.
 */
export type HomePageListingsContainerView = "standings" | "leaderboard";

/**
 * Props for `HomePageListingsContainer`.
 */
export interface HomePageListingsContainerProps {
  activeView?: HomePageListingsContainerView;
  standingsData?: { tours: unknown[] } | null;
  leaderboardData?: { tournament: { name: string }; tours: unknown[] } | null;
  isStandingsLoading?: boolean;
  standingsError?: string | null;
  leaderboardError?: string | null;
  loading?: boolean;
}

/**
 * Props for `NavigationContainer`.
 */
export interface NavigationContainerProps {
  className?: string;
}

export interface NavigationUser {
  id: string;
  email: string;
  avatar?: string;
}

export interface NavigationMember {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  account: number;
  friends: string[];
}

export interface NavigationTourCard {
  appearances: number;
  win: number;
  topTen: number;
  points: number;
  earnings: number;
}

export interface NavigationChampion {
  id: number;
  tournament: {
    name: string;
    logoUrl: string | null;
    startDate: number;
    currentRound: number | null;
  };
}

export interface NavigationItemConfig {
  href: string;
  icon: LucideIcon;
  label: string;
}

export interface NavigationError {
  code: string;
  message: string;
  retry?: () => void;
}

export interface NavigationData {
  user: NavigationUser | null;
  member: NavigationMember | null;
  tourCards: NavigationTourCard[] | null;
  champions: NavigationChampion[] | null;
  isLoading: boolean;
  tourCardLoading: boolean;
  error: NavigationError | null;
  hasNetworkError: boolean;
  retryCount: number;
}

/**
 * Props for `StandingsView`.
 */
export interface StandingsViewProps {
  initialSeasonId?: string;
  initialTourId?: string;
  onSeasonChange?: (seasonId: string) => void;
  onTourChange?: (tourId: string) => void;
}

export type StandingsMember = Doc<"members">;
export type StandingsSeason = Doc<"seasons">;
export type StandingsTour = Doc<"tours">;
export type StandingsTier = Doc<"tiers">;
export type StandingsTournament = Doc<"tournaments">;
export type StandingsTeam = Doc<"teams">;
export type StandingsTourCard = Doc<"tourCards">;

export type ExtendedStandingsTourCard = StandingsTourCard & {
  tour?: StandingsTour;
  isFriend?: boolean;
  pastPoints?: number;
  posChange?: number;
  posChangePO?: number;
  standingsPosition?: number;
  currentPosition?: string;
};

export interface StandingsData {
  tours: StandingsTour[];
  tiers: StandingsTier[];
  tourCards: ExtendedStandingsTourCard[];
  currentTourCard: ExtendedStandingsTourCard | null;
  currentMember: StandingsMember | null;
  teams: StandingsTeam[];
  tournaments: StandingsTournament[];
  currentSeason: StandingsSeason | null;
}

export interface StandingsState {
  data: StandingsData | null;
  isLoading: boolean;
  error: Error | null;
}

export interface FriendManagementHook {
  state: {
    friendChangingIds: Set<string>;
    isUpdating: boolean;
  };
  actions: {
    addFriend: (memberId: string) => Promise<void>;
    removeFriend: (memberId: string) => Promise<void>;
  };
}

/**
 * Type for the countdown time left
 */
export type TimeLeftType = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} | null;

export type LeaderboardVariant = "regular" | "playoff" | "historical";

export type LeaderboardTourToggle = {
  id: string;
  shortForm: string;
  name: string;
  logoUrl?: string | null;
};

export type LeaderboardTournamentLite = {
  name: string;
  currentRound: number | null;
  livePlay?: boolean | null;
};

export type LeaderboardViewerContext = {
  tourCardId?: string | null;
  friendIds?: string[] | null;
  teamGolferApiIds?: number[] | null;
};

export type LeaderboardPgaRow = {
  kind: "pga";
  id: string;
  apiId: number;

  position: string | null;
  posChange: number | null;
  playerName: string;

  score: number | null;
  today: number | null;
  thru: number | null;
  endHole: number | null;

  group: number | null;
  rating: number | null;

  roundOne: number | null;
  roundTwo: number | null;
  roundThree: number | null;
  roundFour: number | null;

  usage: number | null;
  makeCut: number | null;
  topTen: number | null;
  win: number | null;
  worldRank: number | null;

  country: string | null;
  teeTimeDisplay?: string | null;
};

export type LeaderboardTourCardLite = {
  id: string;
  ownerClerkId?: string | null;
  displayName: string;
  tourId?: string | null;
  playoff?: number | null;
};

export type LeaderboardTeamRow = {
  kind: "pgc";
  id: string;

  pastPosition: string | null;
  position: string | null;

  golferApiIds: number[];

  today: number | null;
  thru: number | null;
  score: number | null;

  points: number | null;
  earnings: number | null;

  roundOne: number | null;
  roundTwo: number | null;
  roundThree: number | null;
  roundFour: number | null;

  tourCard: LeaderboardTourCardLite;

  championsCount?: number | null;
  teeTimeDisplay?: string | null;
};

export type LeaderboardViewModelReady = {
  kind: "ready";
  tournament: LeaderboardTournamentLite;
  toggleTours: LeaderboardTourToggle[];
  pgaRows: LeaderboardPgaRow[];
  pgcRows: LeaderboardTeamRow[];
  viewer?: LeaderboardViewerContext;
};

export type LeaderboardViewModelLoading = {
  kind: "loading";
};

export type LeaderboardViewModelError = {
  kind: "error";
  message: string;
};

export type LeaderboardViewModel =
  | LeaderboardViewModelLoading
  | LeaderboardViewModelError
  | LeaderboardViewModelReady;

/**
 * Props for `LeaderboardView`.
 */
export interface LeaderboardViewProps {
  model: LeaderboardViewModel;
  activeTourId: string;
  onChangeTourId: (tourId: string) => void;
  variant: LeaderboardVariant;
  isPreTournament?: boolean;
}

/**
 * Props for `LeaderboardListing`.
 */
export type LeaderboardListingProps =
  | {
      type: "PGC";
      tournament: LeaderboardTournamentLite;
      allGolfers: LeaderboardPgaRow[];
      viewer?: LeaderboardViewerContext;
      team: LeaderboardTeamRow;
      isPreTournament?: boolean;
    }
  | {
      type: "PGA";
      tournament: LeaderboardTournamentLite;
      allGolfers: LeaderboardPgaRow[];
      viewer?: LeaderboardViewerContext;
      golfer: LeaderboardPgaRow;
      isPreTournament?: boolean;
    };
