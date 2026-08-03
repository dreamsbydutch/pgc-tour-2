import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const espnRoundsValidator = v.array(
  v.object({
    round: v.number(),
    totalStrokes: v.optional(v.number()),
    holes: v.array(
      v.object({
        hole: v.number(),
        strokes: v.number(),
        relativeToPar: v.number(),
        synthetic: v.optional(v.boolean()),
      }),
    ),
  }),
);

/**
 * Golf League App - Comprehensive Database Schema
 *
 * A complete, production-ready schema for a golf league fantasy application.
 *
 * Key Features:
 * - Standardized naming conventions (clerkId throughout)
 * - Uses Convex's built-in _creationTime instead of custom createdAt fields
 * - Financial amounts in cents to avoid floating-point precision issues
 * - No soft delete flags (hard deletes)
 * - Optimized indexes for common query patterns
 * - Comprehensive data validation and constraints
 * - Support for both legacy field names during migration
 */

const schema = defineSchema({
  // =========================================================================
  // USER MANAGEMENT
  // =========================================================================

  /**
   * Members - Core user accounts linked to Clerk authentication
   */
  members: defineTable({
    clerkId: v.optional(v.string()), // Clerk authentication user ID
    email: v.string(),
    firstname: v.optional(v.string()),
    lastname: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    role: v.union(
      v.literal("admin"),
      v.literal("moderator"),
      v.literal("regular"),
    ),
    account: v.number(), // Account balance in cents
    friends: v.array(v.union(v.string(), v.id("members"))), // Support both formats during migration
    lastLoginAt: v.optional(v.number()), // Track user activity
    updatedAt: v.optional(v.number()),
  })
    .index("by_email", ["email"])
    .index("by_clerk_id", ["clerkId"])
    .index("by_role", ["role"])
    .index("by_active", ["isActive"])
    .index("by_lastname", ["lastname"])
    .index("by_active_lastname", ["isActive", "lastname"])
    .index("by_last_login", ["lastLoginAt"])
    .index("by_account", ["account"]),

  // =========================================================================
  // GOLF LEAGUE STRUCTURE
  // =========================================================================

  /**
   * Seasons - Golf league seasons (e.g., "2025 Spring", "2025 Fall")
   */
  seasons: defineTable({
    year: v.number(),
    number: v.number(), // Season number within year (1, 2, etc.)
    startDate: v.optional(v.number()), // Season start timestamp
    endDate: v.optional(v.number()), // Season end timestamp
    registrationDeadline: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_year", ["year"])
    .index("by_number", ["number"])
    .index("by_dates", ["startDate", "endDate"]),

  /**
   * Tours - Different golf tours (PGA, LIV, etc.)
   */
  tours: defineTable({
    name: v.string(),
    shortForm: v.string(), // "PGA", "LIV", etc.
    logoUrl: v.string(),
    seasonId: v.id("seasons"),
    buyIn: v.number(), // Buy-in amount in cents
    playoffSpots: v.array(v.number()),
    maxParticipants: v.optional(v.number()),
    registeredCount: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_season", ["seasonId"])
    .index("by_name_season", ["name", "seasonId"]),

  /**
   * Tiers - Tournament tiers with different payouts and points
   */
  tiers: defineTable({
    name: v.string(),
    seasonId: v.id("seasons"),
    payouts: v.array(v.number()), // Payout amounts in cents
    points: v.array(v.number()), // Points awarded
    updatedAt: v.optional(v.number()),
  })
    .index("by_season", ["seasonId"])
    .index("by_name_season", ["name", "seasonId"]),

  /**
   * Courses - Golf courses where tournaments are held
   */
  courses: defineTable({
    apiId: v.string(), // External API identifier
    name: v.string(),
    location: v.string(),
    par: v.number(),
    front: v.number(), // Front 9 par
    back: v.number(), // Back 9 par
    timeZoneOffset: v.number(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_name", ["name"])
    .index("by_api_id", ["apiId"]),

  // =========================================================================
  // TOURNAMENTS & COMPETITION
  // =========================================================================

  /**
   * Tournaments - Individual golf tournaments
   */
  tournaments: defineTable({
    name: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    tierId: v.id("tiers"),
    courseId: v.id("courses"),
    seasonId: v.id("seasons"),
    logoUrl: v.optional(v.string()),
    apiId: v.optional(v.string()), // External API identifier
    espnId: v.optional(v.string()), // ESPN event identifier

    groupsEmailSentAt: v.optional(v.number()),
    reminderEmailSentAt: v.optional(v.number()),

    // Tournament status and live data
    status: v.optional(
      v.union(
        v.literal("upcoming"),
        v.literal("active"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
    currentRound: v.optional(v.number()),
    livePlay: v.optional(v.boolean()),

    // DataGolf sync markers (used to avoid unnecessary live-sync writes)
    dataGolfInPlayLastUpdate: v.optional(v.union(v.string(), v.number())), // Timestamp or version string of last DataGolf "in play" update

    // Timestamp for the last successful live leaderboard sync that applied updates.
    leaderboardLastUpdatedAt: v.optional(v.number()),

    updatedAt: v.optional(v.number()),
  })
    .index("by_season", ["seasonId"])
    .index("by_tier", ["tierId"])
    .index("by_course", ["courseId"])
    .index("by_status", ["status"])
    .index("by_espn_id", ["espnId"])
    .index("by_season_status", ["seasonId", "status"])
    .index("by_season_start_date", ["seasonId", "startDate"])
    .index("by_season_end_date", ["seasonId", "endDate"])
    .index("by_dates", ["startDate", "endDate"]),

  // =========================================================================
  // PLAYER PARTICIPATION
  // =========================================================================

  /**
   * Tour Cards - Player participation in tours (fantasy league memberships)
   */
  tourCards: defineTable({
    displayName: v.string(),
    tourId: v.id("tours"),
    seasonId: v.id("seasons"),
    memberId: v.id("members"),

    // Statistics and performance
    earnings: v.number(), // Total earnings in cents
    points: v.number(), // Total points
    wins: v.optional(v.number()),
    topTen: v.number(),
    topFive: v.optional(v.number()),
    madeCut: v.number(),
    appearances: v.number(),
    playoff: v.optional(v.number()), // Legacy field name
    currentPosition: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_member", ["memberId"])
    .index("by_season", ["seasonId"])
    .index("by_tour", ["tourId"])
    .index("by_member_season", ["memberId", "seasonId"])
    .index("by_season_points", ["seasonId", "points"])
    .index("by_tour_points", ["tourId", "points"])
    .index("by_tour_season", ["tourId", "seasonId"]),

  /**
   * Teams - Fantasy teams for tournaments (golfer selections)
   */
  teams: defineTable({
    tournamentId: v.id("tournaments"),
    tourCardId: v.id("tourCards"),
    golferIds: v.array(v.number()), // Array of golfer API IDs
    seasonId: v.optional(v.id("seasons")),
    tourId: v.optional(v.id("tours")),
    memberId: v.optional(v.id("members")),
    displayName: v.optional(v.string()),
    playoff: v.optional(v.number()),

    // Tournament results
    earnings: v.optional(v.number()), // Earnings in cents
    points: v.optional(v.number()),
    makeCut: v.optional(v.number()),
    position: v.optional(v.string()),
    pastPosition: v.optional(v.string()),
    score: v.optional(v.number()), // Score relative to par

    // Performance metrics
    topTen: v.optional(v.number()),
    topFive: v.optional(v.number()),
    topThree: v.optional(v.number()),
    win: v.optional(v.number()),

    // Live tournament data
    today: v.optional(v.number()),
    thru: v.optional(v.number()),
    round: v.optional(v.number()),

    // Round-specific tee times and scores
    roundOneTeeTime: v.optional(v.union(v.number(), v.string())),
    roundOne: v.optional(v.number()),
    roundTwoTeeTime: v.optional(v.union(v.number(), v.string())),
    roundTwo: v.optional(v.number()),
    roundThreeTeeTime: v.optional(v.union(v.number(), v.string())),
    roundThree: v.optional(v.number()),
    roundFourTeeTime: v.optional(v.union(v.number(), v.string())),
    roundFour: v.optional(v.number()),

    updatedAt: v.optional(v.number()),
    updatedRosterAt: v.optional(v.number()), // Timestamp for last roster change (golferIds update)
  })
    .index("by_tournament", ["tournamentId"])
    .index("by_tournament_member", ["tournamentId", "memberId"])
    .index("by_tournament_tour", ["tournamentId", "tourId"])
    .index("by_tournament_playoff", ["tournamentId", "playoff"])
    .index("by_tour_card", ["tourCardId"])
    .index("by_tour_card_tournament", ["tourCardId", "tournamentId"])
    .index("by_season", ["seasonId"])
    .index("by_tournament_tour_card", ["tournamentId", "tourCardId"])
    .index("by_tournament_points", ["tournamentId", "points"])
    .index("by_tournament_position", ["tournamentId", "position"])
    .index("by_tournament_updated_roster", ["tournamentId", "updatedRosterAt"]),

  standingsContributions: defineTable({
    seasonId: v.id("seasons"),
    tourId: v.id("tours"),
    tourCardId: v.id("tourCards"),
    tournamentId: v.id("tournaments"),
    memberId: v.id("members"),
    displayName: v.string(),
    tournamentName: v.string(),
    tournamentLogoUrl: v.optional(v.string()),
    tournamentStartDate: v.number(),
    tournamentEndDate: v.number(),
    tournamentStatus: v.optional(
      v.union(
        v.literal("upcoming"),
        v.literal("active"),
        v.literal("completed"),
        v.literal("cancelled"),
      ),
    ),
    tierId: v.id("tiers"),
    tierName: v.string(),
    isPlayoff: v.boolean(),
    points: v.optional(v.number()),
    earnings: v.optional(v.number()),
    position: v.optional(v.string()),
    score: v.optional(v.number()),
    roundOne: v.optional(v.number()),
    roundTwo: v.optional(v.number()),
    roundThree: v.optional(v.number()),
    roundFour: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_tour_card_tournament", ["tourCardId", "tournamentId"])
    .index("by_tour_card_season", ["tourCardId", "seasonId"])
    .index("by_tour_card_start_date", ["tourCardId", "tournamentStartDate"])
    .index("by_tournament", ["tournamentId"])
    .index("by_season_tour", ["seasonId", "tourId"]),

  standingsRows: defineTable({
    seasonId: v.id("seasons"),
    tourId: v.id("tours"),
    tourCardId: v.id("tourCards"),
    memberId: v.id("members"),
    displayName: v.string(),
    variant: v.literal("regular"),
    points: v.number(),
    earnings: v.number(),
    wins: v.number(),
    topFive: v.number(),
    topTen: v.number(),
    madeCut: v.number(),
    appearances: v.number(),
    pastPoints: v.number(),
    rank: v.number(),
    currentPosition: v.string(),
    playoff: v.number(),
    posChange: v.number(),
    posChangePO: v.number(),
    updatedAt: v.number(),
  })
    .index("by_card_season_variant", ["tourCardId", "seasonId", "variant"])
    .index("by_season_variant", ["seasonId", "variant"])
    .index("by_season_tour_variant", ["seasonId", "tourId", "variant"])
    .index("by_season_tour_rank", ["seasonId", "tourId", "rank"]),

  // =========================================================================
  // GOLFER DATA
  // =========================================================================

  /**
   * Golfers - Master golfer records (unique golfer identities)
   */
  golfers: defineTable({
    apiId: v.number(), // External API identifier (unique per golfer)
    espnId: v.optional(v.string()), // ESPN athlete identifier
    playerName: v.string(),
    country: v.optional(v.string()),
    worldRank: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_api_id", ["apiId"])
    .index("by_espn_id", ["espnId"])
    .index("by_player_name", ["playerName"])
    .index("by_world_rank", ["worldRank"]),

  /**
   * Tournament Golfers - Golfer performance data for specific tournaments
   */
  tournamentGolfers: defineTable({
    golferId: v.id("golfers"), // Reference to the golfer
    tournamentId: v.id("tournaments"), // Reference to the tournament
    golferApiId: v.optional(v.number()),
    playerName: v.optional(v.string()),
    country: v.optional(v.string()),

    // Tournament performance
    position: v.optional(v.string()),
    posChange: v.optional(v.number()),
    score: v.optional(v.number()),
    makeCut: v.optional(v.number()),
    topTen: v.optional(v.number()),
    win: v.optional(v.number()),
    earnings: v.optional(v.number()), // Earnings in cents

    // Live tournament data
    today: v.optional(v.number()),
    thru: v.optional(v.number()),
    round: v.optional(v.number()),
    endHole: v.optional(v.number()),
    group: v.optional(v.number()),

    // Round-specific data
    roundOneTeeTime: v.optional(v.union(v.number(), v.string())),
    roundOne: v.optional(v.number()),
    roundTwoTeeTime: v.optional(v.union(v.number(), v.string())),
    roundTwo: v.optional(v.number()),
    roundThreeTeeTime: v.optional(v.union(v.number(), v.string())),
    roundThree: v.optional(v.number()),
    roundFourTeeTime: v.optional(v.union(v.number(), v.string())),
    roundFour: v.optional(v.number()),

    // Tournament-specific metadata
    rating: v.optional(v.number()), // Tournament-specific rating
    worldRank: v.optional(v.number()), // Tournament-specific world rank
    usage: v.optional(v.number()), // Tournament-specific usage percentage

    // Isolated ESPN hole-by-hole cache. An empty array means the ESPN identity
    // was confirmed but the golfer has not completed a hole yet.
    espnRounds: v.optional(espnRoundsValidator),
    espnScorecardUpdatedAt: v.optional(v.number()),

    updatedAt: v.optional(v.number()),
  })
    .index("by_tournament", ["tournamentId"])
    .index("by_golfer", ["golferId"])
    .index("by_golfer_tournament", ["golferId", "tournamentId"])
    .index("by_tournament_position", ["tournamentId", "position"])
    .index("by_tournament_score", ["tournamentId", "score"])
    .index("by_earnings", ["earnings"])
    .index("by_tournament_round", ["tournamentId", "round"]),

  tournamentGolferScorecards: defineTable({
    tournamentId: v.id("tournaments"),
    golferId: v.id("golfers"),
    rounds: espnRoundsValidator,
    updatedAt: v.number(),
  })
    .index("by_golfer_tournament", ["golferId", "tournamentId"])
    .index("by_tournament", ["tournamentId"]),

  tournamentSyncState: defineTable({
    tournamentId: v.id("tournaments"),
    dataGolfInPlayLastUpdate: v.optional(v.union(v.string(), v.number())),
    leaderboardLastUpdatedAt: v.optional(v.number()),
    finalDataComplete: v.optional(v.boolean()),
    lastAttemptAt: v.optional(v.number()),
    lastSuccessAt: v.optional(v.number()),
    failureCount: v.optional(v.number()),
    skipReason: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_tournament", ["tournamentId"]),

  /**
   * Operator-facing audit queue for ESPN identities that could not be safely
   * resolved. Adding the appropriate local ID or ESPN ID lets the next sync
   * promote the relationship onto the canonical tournament/golfer document.
   */
  espnIdentityAudit: defineTable({
    entityType: v.union(v.literal("tournament"), v.literal("golfer")),
    status: v.union(
      v.literal("unmatched"),
      v.literal("resolved"),
      v.literal("error"),
    ),
    espnId: v.optional(v.string()),
    espnName: v.optional(v.string()),
    golferId: v.optional(v.id("golfers")),
    tournamentId: v.optional(v.id("tournaments")),
    candidateEspnIds: v.optional(v.array(v.string())),
    candidateNames: v.optional(v.array(v.string())),
    reason: v.optional(v.string()),
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_entity_espn_id", ["entityType", "espnId"])
    .index("by_tournament", ["tournamentId"])
    .index("by_golfer", ["golferId"])
    .index("by_status", ["status"]),

  // =========================================================================
  // FINANCIAL TRANSACTIONS
  // =========================================================================

  /**
   * Transactions - All financial transactions in the system
   */
  transactions: defineTable({
    memberId: v.optional(v.id("members")),
    seasonId: v.id("seasons"),
    amount: v.number(), // Amount in cents (positive = credit, negative = debit)

    payoutEmail: v.optional(v.string()),

    transactionType: v.union(
      v.literal("TourCardFee"),
      v.literal("TournamentWinnings"),
      v.literal("Withdrawal"),
      v.literal("Deposit"),
      v.literal("LeagueDonation"),
      v.literal("CharityDonation"),
      v.literal("Payment"),
      v.literal("Refund"),
      v.literal("Adjustment"),
    ),

    // Transaction status
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled"),
      ),
    ),

    processedAt: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_member", ["memberId"])
    .index("by_season", ["seasonId"])
    .index("by_member_season", ["memberId", "seasonId"])
    .index("by_member_season_type", ["memberId", "seasonId", "transactionType"])
    .index("by_type", ["transactionType"])
    .index("by_status", ["status"])
    .index("by_amount", ["amount"]),

  // =========================================================================
  // SYSTEM & NOTIFICATIONS
  // =========================================================================

  /**
   * Push Subscriptions - Web push notification endpoints
   */
  pushSubscriptions: defineTable({
    memberId: v.id("members"),

    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_member", ["memberId"])
    .index("by_member_endpoint", ["memberId", "endpoint"]),

  /**
   * Audit Logs - Track important system changes for compliance and debugging
   */
  auditLogs: defineTable({
    memberId: v.optional(v.id("members")),
    entityType: v.string(), // Type of entity changed
    entityId: v.string(), // ID of the entity changed
    action: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("deleted"),
      v.literal("restored"),
    ),
    changes: v.optional(v.any()),
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  })
    .index("by_member", ["memberId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_action", ["action"]),

  /**
   * Server-side leases and cooldowns for outbound email actions. These guards
   * prevent concurrent duplicate sends and enforce rate limits independently
   * of any client-side button state.
   */
  emailDispatchGuards: defineTable({
    key: v.string(),
    leaseToken: v.string(),
    leaseExpiresAt: v.number(),
    cooldownUntil: v.number(),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  syncRuns: defineTable({
    jobName: v.string(),
    runKey: v.string(),
    trigger: v.union(v.literal("scheduled"), v.literal("manual")),
    status: v.union(
      v.literal("running"),
      v.literal("succeeded"),
      v.literal("skipped"),
      v.literal("failed"),
      v.literal("abandoned"),
    ),
    actorMemberId: v.optional(v.id("members")),
    tournamentId: v.optional(v.id("tournaments")),
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    leaseExpiresAt: v.number(),
    upstreamUpdatedAt: v.optional(v.number()),
    changedRows: v.optional(v.number()),
    skipReason: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    error: v.optional(v.string()),
  })
    .index("by_job_status", ["jobName", "status"])
    .index("by_job_started", ["jobName", "startedAt"])
    .index("by_run_key", ["runKey"]),

  appState: defineTable({
    key: v.literal("primary"),
    currentSeasonId: v.optional(v.id("seasons")),
    activeTournamentId: v.optional(v.id("tournaments")),
    nextTournamentId: v.optional(v.id("tournaments")),
    seasonPhase: v.union(
      v.literal("no-season"),
      v.literal("registration"),
      v.literal("in-season"),
      v.literal("completed"),
    ),
    publicVersion: v.number(),
    pickWindowTournamentId: v.optional(v.id("tournaments")),
    pickWindowOpensAt: v.optional(v.number()),
    pickWindowClosesAt: v.optional(v.number()),
    pickWindowScheduledTournamentId: v.optional(v.id("tournaments")),
    liveSyncChainId: v.optional(v.string()),
    liveSyncLeaseUntil: v.optional(v.number()),
    liveSyncScheduledTournamentId: v.optional(v.id("tournaments")),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),

  majorChampionBadges: defineTable({
    seasonId: v.id("seasons"),
    memberId: v.id("members"),
    tournamentId: v.id("tournaments"),
    tournamentName: v.string(),
    logoUrl: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_season", ["seasonId"])
    .index("by_season_member", ["seasonId", "memberId"])
    .index("by_tournament_member", ["tournamentId", "memberId"]),
});

export default schema;
