import { v } from "convex/values";
import type { ValidateTournamentDataInput } from "../types/tournaments";
import { validators } from "./common";
import { ValidationResult } from "../types/types";

export const tournamentsValidators = {
  args: {
    createTournaments: {
      clerkId: v.optional(v.string()),
      data: v.object({
        name: v.string(),
        seasonId: v.id("seasons"),
        tierId: v.id("tiers"),
        courseId: v.id("courses"),
        startDate: v.number(),
        endDate: v.number(),
        logoUrl: v.optional(v.string()),
        apiId: v.optional(v.string()),
        status: v.optional(
          v.union(
            v.literal("upcoming"),
            v.literal("active"),
            v.literal("completed"),
            v.literal("cancelled"),
          ),
        ),
        livePlay: v.optional(v.boolean()),
        currentRound: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          setActive: v.optional(v.boolean()),
          autoSetStatus: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeSeason: v.optional(v.boolean()),
        }),
      ),
    },
    getTournaments: {
      options: v.optional(
        v.object({
          id: v.optional(v.id("tournaments")),
          ids: v.optional(v.array(v.id("tournaments"))),
          filter: v.optional(
            v.object({
              seasonId: v.optional(v.id("seasons")),
              tierId: v.optional(v.id("tiers")),
              courseId: v.optional(v.id("courses")),
              tourIds: v.optional(v.array(v.id("tours"))),
              status: v.optional(
                v.union(
                  v.literal("upcoming"),
                  v.literal("active"),
                  v.literal("completed"),
                  v.literal("cancelled"),
                ),
              ),
              startAfter: v.optional(v.number()),
              startBefore: v.optional(v.number()),
              endAfter: v.optional(v.number()),
              endBefore: v.optional(v.number()),
              hasRegistration: v.optional(v.boolean()),
              livePlay: v.optional(v.boolean()),
              currentRound: v.optional(v.number()),
              searchTerm: v.optional(v.string()),
              createdAfter: v.optional(v.number()),
              createdBefore: v.optional(v.number()),
              updatedAfter: v.optional(v.number()),
              updatedBefore: v.optional(v.number()),
            }),
          ),
          sort: v.optional(
            v.object({
              sortBy: v.optional(
                v.union(
                  v.literal("name"),
                  v.literal("startDate"),
                  v.literal("endDate"),
                  v.literal("status"),
                  v.literal("createdAt"),
                  v.literal("updatedAt"),
                ),
              ),
              sortOrder: v.optional(
                v.union(v.literal("asc"), v.literal("desc")),
              ),
            }),
          ),
          pagination: v.optional(
            v.object({
              limit: v.optional(v.number()),
              offset: v.optional(v.number()),
            }),
          ),
          enhance: v.optional(
            v.object({
              includeSeason: v.optional(v.boolean()),
              includeTier: v.optional(v.boolean()),
              includeCourse: v.optional(v.boolean()),
              includeTours: v.optional(v.boolean()),
              includeTeams: v.optional(v.boolean()),
              includeGolfers: v.optional(v.boolean()),
              includeLeaderboard: v.optional(v.boolean()),
              includeStatistics: v.optional(v.boolean()),
            }),
          ),
          activeOnly: v.optional(v.boolean()),
          upcomingOnly: v.optional(v.boolean()),
          liveOnly: v.optional(v.boolean()),
          includeAnalytics: v.optional(v.boolean()),
        }),
      ),
    },
    tournamentId: {
      tournamentId: v.id("tournaments"),
    },
    optionalTournamentId: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    fetchTournamentOptions: {
      seasonId: v.optional(v.id("seasons")),
      tierId: v.optional(v.id("tiers")),
      tournamentId: v.optional(v.id("tournaments")),
      tournamentIds: v.optional(v.array(v.id("tournaments"))),
      tournamentType: v.optional(
        v.union(
          v.literal("active"),
          v.literal("next"),
          v.literal("recent"),
          v.literal("completed"),
          v.literal("upcoming"),
          v.literal("all"),
        ),
      ),
      includeSeason: v.optional(v.boolean()),
      includeTier: v.optional(v.boolean()),
      includeCourse: v.optional(v.boolean()),
      includeTours: v.optional(v.boolean()),
      includeTeams: v.optional(v.boolean()),
      includeGolfers: v.optional(v.boolean()),
      includeTourCards: v.optional(v.boolean()),
      includeLeaderboard: v.optional(v.boolean()),
      includePlayoffs: v.optional(v.boolean()),
    },
    getTournamentLeaderboardView: {
      tournamentId: v.id("tournaments"),
      options: v.optional(
        v.object({
          includeTournamentEnhancements: v.optional(
            v.object({
              includeSeason: v.optional(v.boolean()),
              includeTier: v.optional(v.boolean()),
              includeCourse: v.optional(v.boolean()),
            }),
          ),
          includeTours: v.optional(v.boolean()),
          includeViewer: v.optional(v.boolean()),
          viewerClerkId: v.optional(v.string()),
        }),
      ),
    },
    getAllTournaments: {
      seasonId: v.optional(v.id("seasons")),
    },
    updateTournaments: {
      clerkId: v.optional(v.string()),
      tournamentId: v.id("tournaments"),
      data: v.object({
        name: v.optional(v.string()),
        startDate: v.optional(v.number()),
        endDate: v.optional(v.number()),
        seasonId: v.optional(v.id("seasons")),
        tierId: v.optional(v.id("tiers")),
        courseId: v.optional(v.id("courses")),
        logoUrl: v.optional(v.string()),
        apiId: v.optional(v.string()),
        status: v.optional(
          v.union(
            v.literal("upcoming"),
            v.literal("active"),
            v.literal("completed"),
            v.literal("cancelled"),
          ),
        ),
        livePlay: v.optional(v.boolean()),
        currentRound: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          updateTimestamp: v.optional(v.boolean()),
          autoUpdateStatus: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeSeason: v.optional(v.boolean()),
          includeTier: v.optional(v.boolean()),
        }),
      ),
    },
    deleteTournaments: {
      tournamentId: v.id("tournaments"),
      options: v.optional(
        v.object({
          softDelete: v.optional(v.boolean()),
          cascadeDelete: v.optional(v.boolean()),
          cleanupTeams: v.optional(v.boolean()),
          returnDeletedData: v.optional(v.boolean()),
        }),
      ),
    },
  },
  validateTournamentData: (
    data: ValidateTournamentDataInput,
  ): ValidationResult => {
    const errors: string[] = [];

    const nameErr = validators.stringLength(
      data.name,
      3,
      100,
      "Tournament name",
    );
    if (nameErr) errors.push(nameErr);

    if (data.startDate && data.endDate && data.startDate >= data.endDate) {
      errors.push("Start date must be before end date");
    }

    if (
      data.status &&
      !["upcoming", "active", "completed", "cancelled"].includes(data.status)
    ) {
      errors.push("Invalid tournament status");
    }

    return { isValid: errors.length === 0, errors };
  },
};
