import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    .index("by_is_active", ["isActive"])
    .index("by_role", ["role"])
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
    .index("by_api_id", ["apiId"])
    .index("by_location", ["location"]),

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

    groupsEmailSentAt: v.optional(v.float64()),
    reminderEmailSentAt: v.optional(v.float64()),

    updatedAt: v.optional(v.number()),
  })
    .index("by_season", ["seasonId"])
    .index("by_tier", ["tierId"])
    .index("by_course", ["courseId"])
    .index("by_status", ["status"])
    .index("by_season_status", ["seasonId", "status"])
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
    roundOneTeeTime: v.optional(v.string()),
    roundOne: v.optional(v.number()),
    roundTwoTeeTime: v.optional(v.string()),
    roundTwo: v.optional(v.number()),
    roundThreeTeeTime: v.optional(v.string()),
    roundThree: v.optional(v.number()),
    roundFourTeeTime: v.optional(v.string()),
    roundFour: v.optional(v.number()),

    updatedAt: v.optional(v.number()),
  })
    .index("by_tournament", ["tournamentId"])
    .index("by_tour_card", ["tourCardId"])
    .index("by_tournament_tour_card", ["tournamentId", "tourCardId"])
    .index("by_tournament_points", ["tournamentId", "points"])
    .index("by_tournament_position", ["tournamentId", "position"]),

  // =========================================================================
  // GOLFER DATA
  // =========================================================================

  /**
   * Golfers - Master golfer records (unique golfer identities)
   */
  golfers: defineTable({
    apiId: v.number(), // External API identifier (unique per golfer)
    playerName: v.string(),
    country: v.optional(v.string()),
    worldRank: v.optional(v.number()),
    updatedAt: v.optional(v.number()),
  })
    .index("by_api_id", ["apiId"])
    .index("by_player_name", ["playerName"])
    .index("by_world_rank", ["worldRank"]),

  /**
   * Tournament Golfers - Golfer performance data for specific tournaments
   */
  tournamentGolfers: defineTable({
    golferId: v.id("golfers"), // Reference to the golfer
    tournamentId: v.id("tournaments"), // Reference to the tournament

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
    roundOneTeeTime: v.optional(v.string()),
    roundOne: v.optional(v.number()),
    roundTwoTeeTime: v.optional(v.string()),
    roundTwo: v.optional(v.number()),
    roundThreeTeeTime: v.optional(v.string()),
    roundThree: v.optional(v.number()),
    roundFourTeeTime: v.optional(v.string()),
    roundFour: v.optional(v.number()),

    // Tournament-specific metadata
    rating: v.optional(v.number()), // Tournament-specific rating
    worldRank: v.optional(v.number()), // Tournament-specific world rank
    usage: v.optional(v.number()), // Tournament-specific usage percentage

    updatedAt: v.optional(v.number()),
  })
    .index("by_tournament", ["tournamentId"])
    .index("by_golfer", ["golferId"])
    .index("by_golfer_tournament", ["golferId", "tournamentId"])
    .index("by_tournament_position", ["tournamentId", "position"])
    .index("by_tournament_score", ["tournamentId", "score"])
    .index("by_earnings", ["earnings"])
    .index("by_tournament_round", ["tournamentId", "round"]),

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
    .index("by_member_status_type", ["memberId", "status", "transactionType"])
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
    memberId: v.id("members"),
    entityType: v.string(), // Type of entity changed
    entityId: v.string(), // ID of the entity changed
    action: v.union(
      v.literal("created"),
      v.literal("updated"),
      v.literal("deleted"),
      v.literal("restored"),
    ),
    changes: v.optional(v.object({})), // JSON object of what changed
    ipAddress: v.optional(v.string()),
    userAgent: v.optional(v.string()),
  })
    .index("by_member", ["memberId"])
    .index("by_entity", ["entityType", "entityId"])
    .index("by_action", ["action"]),
});

export default schema;
