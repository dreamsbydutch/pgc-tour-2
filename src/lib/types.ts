import type { ComponentType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Doc } from "@/convex";

export type TransactionType =
  | "TourCardFee"
  | "TournamentWinnings"
  | "Withdrawal"
  | "Deposit"
  | "LeagueDonation"
  | "CharityDonation"
  | "Payment"
  | "Refund"
  | "Adjustment";

export type TransactionStatus =
  | "pending"
  | "completed"
  | "failed"
  | "cancelled";

export type Article = {
  slug: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: string;
  tags?: string[];
  Body: ComponentType;
};

export type ArticleModule = { article: Article };

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
 * Tier row shape for points distributions.
 */
export type TierPointsRow = { key: string; name: string; points: number[] };

/**
 * Tier row shape for payouts distributions.
 */
export type TierPayoutsRow = { key: string; name: string; payouts: number[] };

/**
 * Props for `TierDistributionsTable`.
 */
export type TierDistributionsTableProps =
  | { kind: "points"; tiers?: TierPointsRow[]; loading?: boolean }
  | { kind: "payouts"; tiers?: TierPayoutsRow[]; loading?: boolean };

/**
 * View options for `HomePageListingsContainer`.
 */
type HomePageListingsContainerView = "standings" | "leaderboard";

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

export interface NavigationItemConfig {
  href: string;
  icon: LucideIcon;
  label: string;
}

/**
 * Generic dropdown list item used by the `Dropdown` UI primitive.
 */
export type DropdownItem = {
  key: string;
  title: string;
  subtitle?: string;
  iconUrl?: string | null;
  isActive?: boolean;
  onSelect: () => void;
  className?: string;
};

/**
 * Optional grouping for dropdown lists.
 */
export type DropdownSection = {
  key: string;
  title?: string;
  items: DropdownItem[];
};

export interface NavigationError {
  code: string;
  message: string;
  retry?: () => void;
}

export interface ErrorResponse {
  isError: true;
  isAuthError: boolean;
  isNotFoundError: boolean;
  isValidationError: boolean;
  message: string;
  originalError: unknown;
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

// Main types for front end calls

export type Season = Doc<"seasons">;
export type Course = Doc<"courses">;
export type Golfer = Doc<"golfers">;
export type Tier = Doc<"tiers">;
export type Tour = Doc<"tours">;
export type Team = Doc<"teams">;
export type TourCard = Doc<"tourCards"> & { member: Doc<"members"> };
export type TournamentGolfer = Doc<"tournamentGolfers"> & {
  golfer: Golfer;
};
export type Tournament = Doc<"tournaments"> & {
  course: Course;
  tier: Tier;
  season: Season;
};

export type PgaLeaderboardRow = {
  position: string;
  playerName: string;
  score: number;
  apiId: number;
  country: string | null;
  roundOne: number;
  roundTwo: number;
  roundThree: number;
  roundFour: number;
  posChange: number;
  worldRank: number | null;
  rating: number | null;
  group: number | null;
  thru: number | null;
  today: number | null;
  makeCut: number | null;
  topTen: number | null;
  win: number | null;
  usage: number | null;
  teeTimeDisplay: string | number | null | undefined;
};
