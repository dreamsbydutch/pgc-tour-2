/**
 * Shared Types for Convex Functions
 *
 * Centralized type definitions for all entity CRUD operations
 * to ensure consistency and reusability across the application.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader, DatabaseWriter } from "../_generated/server";

// =============================================================================
// DATABASE CONTEXT TYPES
// =============================================================================

export interface QueryContext {
  db: DatabaseReader;
}

export interface MutationContext {
  db: DatabaseWriter;
}

// Generic database context for helper functions
export interface DatabaseContext {
  db: DatabaseReader | DatabaseWriter;
}

// =============================================================================
// DOCUMENT TYPES
// =============================================================================

export type TourDoc = Doc<"tours">;
export type TournamentDoc = Doc<"tournaments">;
export type SeasonDoc = Doc<"seasons">;
export type TierDoc = Doc<"tiers">;
export type MemberDoc = Doc<"members">;
export type TourCardDoc = Doc<"tourCards">;
export type TeamDoc = Doc<"teams">;
export type CourseDoc = Doc<"courses">;
export type GolferDoc = Doc<"golfers">;
export type TournamentGolferDoc = Doc<"tournamentGolfers">;
export type TransactionDoc = Doc<"transactions">;

// Enhanced document types with computed fields
export interface EnhancedTourDoc extends TourDoc {
  buyInFormatted?: string;
  totalPlayoffSpots?: number;
  season?: SeasonDoc;
  tournaments?: TournamentDoc[];
  tournamentCount?: number;
  participants?: (TourCardDoc & { member: MemberDoc | null })[];
  statistics?: TourStatistics;
  tourCards?: TourCardDoc[];
}

export interface EnhancedTournamentDoc extends TournamentDoc {
  dateRange?: string;
  duration?: number;
  calculatedStatus?: "upcoming" | "active" | "completed" | "cancelled";
  season?: SeasonDoc;
  tier?: TierDoc;
  course?: CourseDoc;
  tours?: TourDoc[];
  teams?: TeamDoc[];
  teamCount?: number;
  golfers?: (TournamentGolferDoc & { golfer: GolferDoc | null })[];
  statistics?: TournamentStatistics;
}

export interface TourStatistics {
  totalParticipants: number;
  activeParticipants: number;
  totalEarnings: number;
  totalPoints: number;
  averageEarnings: number;
  averagePoints: number;
}

export interface TournamentStatistics {
  totalTeams: number;
  activeTeams: number;
  averageScore: number;
  lowestScore: number;
  highestScore: number;
}

export interface EnhancedTierDoc extends TierDoc {
  totalPayouts?: number;
  totalPoints?: number;
  averagePayout?: number;
  averagePoints?: number;
  payoutLevels?: number;
  pointLevels?: number;
  season?: SeasonDoc;
  tournaments?: TournamentDoc[];
  tournamentCount?: number;
  statistics?: TierStatistics;
}

export interface TierStatistics {
  totalTournaments: number;
  activeTournaments: number;
  totalDistributedPayouts: number;
  totalDistributedPoints: number;
  participantCount: number;
  averageParticipants: number;
}

// Utility function types
export type TourSortFunction = ((a: TourDoc, b: TourDoc) => number) | undefined;
export type TournamentSortFunction =
  | ((a: TournamentDoc, b: TournamentDoc) => number)
  | undefined;
export type TierSortFunction = ((a: TierDoc, b: TierDoc) => number) | undefined;

// =============================================================================
// BASE CRUD TYPES
// =============================================================================

export interface BaseFilterOptions {
  searchTerm?: string;
  createdAfter?: number;
  createdBefore?: number;
  updatedAfter?: number;
  updatedBefore?: number;
}

export interface BaseSortOptions {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface BasePaginationOptions {
  limit?: number;
  offset?: number;
}

export interface BaseEnhancementOptions {
  includeRelated?: boolean;
  includeStatistics?: boolean;
  includeHistory?: boolean;
}

export interface BaseCreateOptions {
  skipValidation?: boolean;
  setActive?: boolean;
}

export interface BaseUpdateOptions {
  skipValidation?: boolean;
  updateTimestamp?: boolean;
  cascadeUpdates?: boolean;
}

export interface BaseDeleteOptions {
  softDelete?: boolean;
  cascadeDelete?: boolean;
}

export interface BaseQueryOptions<TTable extends EntityType = EntityType> {
  id?: Id<TTable>;
  ids?: Id<TTable>[];
  filter?: BaseFilterOptions;
  sort?: BaseSortOptions;
  pagination?: BasePaginationOptions;
  enhance?: BaseEnhancementOptions;
}

// =============================================================================
// TOURS SPECIFIC TYPES
// =============================================================================

export interface TourFilterOptions extends BaseFilterOptions {
  seasonId?: Id<"seasons">;
  shortForm?: string;
  minBuyIn?: number;
  maxBuyIn?: number;
  minParticipants?: number;
  maxParticipants?: number;
  hasDescription?: boolean;
  playoffSpotsMin?: number;
  playoffSpotsMax?: number;
}

export interface TourSortOptions extends BaseSortOptions {
  sortBy?:
    | "name"
    | "shortForm"
    | "buyIn"
    | "maxParticipants"
    | "createdAt"
    | "updatedAt"
    | "playoffSpots";
}

export interface TourEnhancementOptions extends BaseEnhancementOptions {
  includeSeason?: boolean;
  includeTournaments?: boolean;
  includeParticipants?: boolean;
  includeTourCards?: boolean;
}

export interface TourCreateOptions extends BaseCreateOptions {
  autoCreateTourCards?: boolean;
}

export interface TourUpdateOptions extends BaseUpdateOptions {
  cascadeToTourCards?: boolean;
}

export interface TourDeleteOptions extends BaseDeleteOptions {
  transferParticipants?: Id<"tours">;
}

export interface TourQueryOptions extends BaseQueryOptions<"tours"> {
  filter?: TourFilterOptions;
  sort?: TourSortOptions;
  enhance?: TourEnhancementOptions;
}

// =============================================================================
// TOURNAMENTS SPECIFIC TYPES
// =============================================================================

export interface TournamentFilterOptions extends BaseFilterOptions {
  seasonId?: Id<"seasons">;
  tierId?: Id<"tiers">;
  courseId?: Id<"courses">;
  tourIds?: Id<"tours">[];
  status?: "upcoming" | "active" | "completed" | "cancelled";
  startAfter?: number;
  startBefore?: number;
  endAfter?: number;
  endBefore?: number;
  hasRegistration?: boolean;
  livePlay?: boolean;
  currentRound?: number;
}

export interface TournamentSortOptions extends BaseSortOptions {
  sortBy?:
    | "name"
    | "startDate"
    | "endDate"
    | "status"
    | "createdAt"
    | "updatedAt"
    | "registrationDeadline";
}

export interface TournamentEnhancementOptions extends BaseEnhancementOptions {
  includeSeason?: boolean;
  includeTier?: boolean;
  includeCourse?: boolean;
  includeTours?: boolean;
  includeTeams?: boolean;
  includeGolfers?: boolean;
  includeLeaderboard?: boolean;
}

export interface TournamentQueryOptions
  extends BaseQueryOptions<"tournaments"> {
  filter?: TournamentFilterOptions;
  sort?: TournamentSortOptions;
  enhance?: TournamentEnhancementOptions;
}

// =============================================================================
// TIERS SPECIFIC TYPES
// =============================================================================

export interface TierFilterOptions extends BaseFilterOptions {
  seasonId?: Id<"seasons">;
  name?: string;
  minPayouts?: number;
  maxPayouts?: number;
  minPoints?: number;
  maxPoints?: number;
  minParticipants?: number;
  maxParticipants?: number;
  hasDescription?: boolean;
  payoutLevelsMin?: number;
  payoutLevelsMax?: number;
  pointLevelsMin?: number;
  pointLevelsMax?: number;
}

export interface TierSortOptions extends BaseSortOptions {
  sortBy?:
    | "name"
    | "totalPayouts"
    | "totalPoints"
    | "minimumParticipants"
    | "maximumParticipants"
    | "createdAt"
    | "updatedAt";
}

export interface TierEnhancementOptions extends BaseEnhancementOptions {
  includeSeason?: boolean;
  includeTournaments?: boolean;
  includeStatistics?: boolean;
}

export interface TierQueryOptions extends BaseQueryOptions<"tiers"> {
  filter?: TierFilterOptions;
  sort?: TierSortOptions;
  enhance?: TierEnhancementOptions;
}

export interface TierOptimizedQueryOptions {
  filter?: TierFilterOptions;
  activeOnly?: boolean;
}

// =============================================================================
// TEAMS SPECIFIC TYPES
// =============================================================================

export interface EnhancedTeamDoc extends TeamDoc {
  totalScore?: number;
  finalPosition?: number;
  earningsFormatted?: string;
  tournament?: TournamentDoc;
  tourCard?: TourCardDoc;
  member?: MemberDoc;
  golfers?: Array<
    Omit<GolferDoc, "worldRank"> & {
      worldRank: number | null;
      group: number | null;
      rating: number | null;
    }
  >;
  statistics?: TeamStatistics;
}

export interface TeamStatistics {
  averageScore: number;
  bestRound: number;
  worstRound: number;
  cutsMade: number;
  totalTournaments: number;
  totalEarnings: number;
  totalPoints: number;
  averagePosition: number;
}

export interface TeamFilterOptions extends BaseFilterOptions {
  tournamentId?: Id<"tournaments">;
  tourCardId?: Id<"tourCards">;
  minEarnings?: number;
  maxEarnings?: number;
  minPoints?: number;
  maxPoints?: number;
  minScore?: number;
  maxScore?: number;
  position?: string;
  round?: number;
  makeCut?: number;
  hasTopTen?: boolean;
  hasWin?: boolean;
  golferCount?: number;
}

export interface TeamSortOptions extends BaseSortOptions {
  sortBy?:
    | "earnings"
    | "points"
    | "score"
    | "position"
    | "today"
    | "round"
    | "createdAt"
    | "updatedAt";
}

export interface TeamEnhancementOptions extends BaseEnhancementOptions {
  includeTournament?: boolean;
  includeTourCard?: boolean;
  includeMember?: boolean;
  includeGolfers?: boolean;
  includeStatistics?: boolean;
  includeRounds?: boolean;
}

export interface TeamQueryOptions extends BaseQueryOptions<"teams"> {
  filter?: TeamFilterOptions;
  sort?: TeamSortOptions;
  enhance?: TeamEnhancementOptions;
}

export interface TeamOptimizedQueryOptions {
  filter?: TeamFilterOptions;
  activeOnly?: boolean;
  tournamentOnly?: boolean;
}

export type TeamSortFunction = ((a: TeamDoc, b: TeamDoc) => number) | undefined;

// =============================================================================
// MEMBERS SPECIFIC TYPES
// =============================================================================

export interface MemberFilterOptions extends BaseFilterOptions {
  clerkId?: string;
  email?: string;
  role?: "admin" | "moderator" | "regular";
  hasBalance?: boolean;
  minBalance?: number;
  maxBalance?: number;
  hasFriends?: boolean;
  isOnline?: boolean;
  joinedAfter?: number;
  joinedBefore?: number;
  lastLoginAfter?: number;
  lastLoginBefore?: number;
}

export interface MemberSortOptions extends BaseSortOptions {
  sortBy?:
    | "firstname"
    | "lastname"
    | "email"
    | "account"
    | "role"
    | "createdAt"
    | "updatedAt"
    | "lastLoginAt";
}

export interface MemberEnhancementOptions extends BaseEnhancementOptions {
  includeFriends?: boolean;
  includeTransactions?: boolean;
  includeTourCards?: boolean;
  includeTeams?: boolean;
}

export interface MemberQueryOptions extends BaseQueryOptions<"members"> {
  clerkId?: string;
  filter?: MemberFilterOptions;
  sort?: MemberSortOptions;
  enhance?: MemberEnhancementOptions;
}

// Enhanced member document with computed fields and relationships
export interface EnhancedMemberDoc extends Omit<MemberDoc, "friends"> {
  // Keep original friends property
  friends: (string | Id<"members">)[];

  // Computed display fields
  fullName: string;
  formattedBalance: string;

  // Status fields
  hasBalance: boolean;
  isOnline: boolean;
  daysSinceLastLogin?: number;

  // Related data (optional)
  friendMembers?: MemberDoc[];
  friendCount?: number;
  tourCards?: TourCardDoc[];
  teams?: TeamDoc[];
  transactions?: TransactionDoc[];
}

// Member statistics for analytics
export interface MemberStatistics {
  totalMembers: number;
  activeMembers: number;
  adminCount: number;
  moderatorCount: number;
  regularCount: number;
  totalBalance: number;
  averageBalance: number;
  membersWithBalance: number;
  onlineMembers: number;
  recentlyActive: number; // Active in last 7 days
}

// Optimized query options for member operations
export interface MemberOptimizedQueryOptions {
  filter?: MemberFilterOptions;
  activeOnly?: boolean;
  adminOnly?: boolean;
  clerkIdLookup?: string;
  emailLookup?: string;
}

// Member sort function type
export type MemberSortFunction =
  | ((a: MemberDoc, b: MemberDoc) => number)
  | undefined;

// =============================================================================
// SEASONS SPECIFIC TYPES
// =============================================================================

export interface SeasonFilterOptions extends BaseFilterOptions {
  year?: number;
  minYear?: number;
  maxYear?: number;
  number?: number;
  startAfter?: number;
  startBefore?: number;
  endAfter?: number;
  endBefore?: number;
  isUpcoming?: boolean;
  isCompleted?: boolean;
}

export interface SeasonSortOptions extends BaseSortOptions {
  sortBy?:
    | "name"
    | "year"
    | "startDate"
    | "endDate"
    | "createdAt"
    | "updatedAt";
}

export interface SeasonEnhancementOptions extends BaseEnhancementOptions {
  includeTours?: boolean;
  includeTournaments?: boolean;
  includeMembers?: boolean;
  includeTotals?: boolean;
}

export interface SeasonQueryOptions extends BaseQueryOptions<"seasons"> {
  filter?: SeasonFilterOptions;
  sort?: SeasonSortOptions;
  enhance?: SeasonEnhancementOptions;
}

export interface SeasonOptimizedQueryOptions {
  filter?: SeasonFilterOptions;
}

export interface EnhancedSeasonDoc extends SeasonDoc {
  duration?: number;
  daysRemaining?: number;
  isUpcoming?: boolean;
  isInProgress?: boolean;
  isCompleted?: boolean;
  tours?: TourDoc[];
  tournaments?: TournamentDoc[];
  members?: MemberDoc[];
  statistics?: SeasonStatistics;
}

export interface SeasonStatistics {
  totalTours: number;
  activeTours: number;
  totalTournaments: number;
  activeTournaments: number;
  totalMembers: number;
  activeMembers: number;
  totalEarnings: number;
  totalPoints: number;
}

export type SeasonSortFunction =
  | ((a: SeasonDoc, b: SeasonDoc) => number)
  | undefined;

// =============================================================================
// GOLFERS SPECIFIC TYPES
// =============================================================================

export interface GolferFilterOptions extends BaseFilterOptions {
  apiId?: number;
  playerName?: string;
  country?: string;
  worldRank?: number;
  minWorldRank?: number;
  maxWorldRank?: number;
  searchTerm?: string;
}

export interface GolferSortOptions extends BaseSortOptions {
  sortBy?:
    | "playerName"
    | "country"
    | "worldRank"
    | "apiId"
    | "createdAt"
    | "updatedAt";
}

export interface GolferEnhancementOptions extends BaseEnhancementOptions {
  includeTournaments?: boolean;
  includeStatistics?: boolean;
  includeTeams?: boolean;
  includeRecentPerformance?: boolean;
}

export interface GolferQueryOptions extends BaseQueryOptions<"golfers"> {
  apiId?: number;
  filter?: GolferFilterOptions;
  sort?: GolferSortOptions;
  enhance?: GolferEnhancementOptions;
}

export interface GolferOptimizedQueryOptions {
  filter?: GolferFilterOptions;
  activeOnly?: boolean;
  apiIdLookup?: number;
  playerNameLookup?: string;
}

// Enhanced golfer document with computed fields and relationships
export interface EnhancedGolferDoc extends GolferDoc {
  // Computed display fields
  displayName: string;
  rankDisplay: string;
  hasRanking: boolean;

  // Status fields
  isRanked: boolean;
  rankingCategory: "top10" | "top50" | "top100" | "ranked" | "unranked";

  // Related data (optional)
  tournaments?: TournamentDoc[];
  tournamentGolfers?: TournamentGolferDoc[];
  teams?: TeamDoc[];
  recentPerformance?: TournamentGolferDoc[];
  statistics?: GolferStatistics;
}

// Golfer statistics for analytics
export interface GolferStatistics {
  totalTournaments: number;
  activeTournaments: number;
  totalTeams: number;
  averageScore?: number;
  bestFinish?: number;
  cuts: number;
  cutsMissed: number;
  topTens: number;
  topFives: number;
  wins: number;
  totalEarnings: number;
  totalPoints: number;
  recentForm: "excellent" | "good" | "average" | "poor" | "unknown";
}

// Golfer sort function type
export type GolferSortFunction =
  | ((a: GolferDoc, b: GolferDoc) => number)
  | undefined;

// =============================================================================
// COURSE TYPES
// =============================================================================

// Course filter options for advanced querying
export interface CourseFilterOptions {
  apiId?: string;
  name?: string;
  location?: string;
  minPar?: number;
  maxPar?: number;
  timeZoneRange?: number[]; // [min, max] offset hours
  searchTerm?: string;
  createdAfter?: number;
  createdBefore?: number;
  updatedAfter?: number;
  updatedBefore?: number;
}

// Course sorting options
export interface CourseSortOptions {
  sortBy?:
    | "name"
    | "location"
    | "par"
    | "front"
    | "back"
    | "timeZoneOffset"
    | "createdAt"
    | "updatedAt";
  sortOrder?: "asc" | "desc";
}

// Enhanced course document with computed fields and relationships
export interface EnhancedCourseDoc extends CourseDoc {
  // Computed display fields
  fullLocation: string;
  parDisplay: string;
  timeZoneDisplay: string;

  // Status fields
  hasFullDetails: boolean;

  // Related data (optional)
  tournaments?: TournamentDoc[];
  tournamentCount?: number;
  upcomingTournaments?: TournamentDoc[];
  recentTournaments?: TournamentDoc[];
  statistics?: CourseStatistics;
}

// Course statistics for analytics
export interface CourseStatistics {
  totalTournaments: number;
  activeTournaments: number;
  upcomingTournaments: number;
  averageFieldSize?: number;
  totalRounds: number;
  usageByYear: Record<string, number>;
  popularityRank?: number;
  averageScore?: number;
  lowScore?: number;
  highScore?: number;
}

// Course sort function type
export type CourseSortFunction =
  | ((a: CourseDoc, b: CourseDoc) => number)
  | undefined;

// Course optimized query options
export interface CourseOptimizedQueryOptions {
  filter?: CourseFilterOptions;
  activeOnly?: boolean;
  apiIdLookup?: string;
  locationLookup?: string;
}

// =============================================================================
// VALIDATION RESULT TYPES
// =============================================================================

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings?: string[];
}

// Analytics statistics type
export interface AnalyticsStatistics {
  averageBuyIn?: number;
  totalBuyInValue?: number;
  averagePlayoffSpots?: number;
  averageEarnings?: number;
  totalEarnings?: number;
  averagePoints?: number;
  totalPoints?: number;
  [key: string]: number | undefined;
}

export interface AnalyticsResult {
  total: number;
  active: number;
  inactive: number;
  statistics: AnalyticsStatistics;
  breakdown?: Record<string, number>;
  trends?: Record<string, number>;
}

export interface SearchResult<T> {
  results: T[];
  total: number;
  hasMore: boolean;
  nextOffset?: number;
}

// =============================================================================
// COMMON RESPONSE TYPES
// =============================================================================

export interface CreateResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
}

export interface UpdateResponse<T> {
  success: boolean;
  data?: T;
  updated: boolean;
  error?: string;
  warnings?: string[];
}

export interface DeleteResponse<T = unknown> {
  success: boolean;
  deleted: boolean;
  deactivated?: boolean;
  error?: string;
  transferredCount?: number;
  deletedData?: T;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

export type EntityType =
  | "tours"
  | "tournaments"
  | "members"
  | "seasons"
  | "tiers"
  | "teams"
  | "courses"
  | "golfers";

export interface ProcessDataOptions<T> {
  filter?: (item: T) => boolean;
  sort?: (a: T, b: T) => number;
  limit?: number;
  skip?: number;
}

export interface MigrationData {
  oldId: string;
  mappingTable?: string;
  skipExisting?: boolean;
  updateExisting?: boolean;
}

// =============================================================================
// UTILITY FUNCTION TYPES
// =============================================================================

export interface TourUpdateData {
  name?: string;
  shortForm?: string;
  logoUrl?: string;
  buyIn?: number;
  playoffSpots?: number[];
  maxParticipants?: number;
  description?: string;
  updatedAt?: number;
}

export interface OptimizedQueryOptions {
  filter?: TourFilterOptions;
  activeOnly?: boolean;
}

export interface TournamentOptimizedQueryOptions {
  filter?: TournamentFilterOptions;
  activeOnly?: boolean;
  upcomingOnly?: boolean;
  liveOnly?: boolean;
}

export interface EnhanceOptions {
  includeSeason?: boolean;
  includeStatistics?: boolean;
  includeParticipants?: boolean;
  includeTournaments?: boolean;
  includeTourCards?: boolean;
}

// Enhanced participant type with member data
export interface ParticipantWithMember extends TourCardDoc {
  member: MemberDoc | null;
}
