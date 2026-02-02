import { v } from "convex/values";
import type { ValidateTeamDataInput } from "../types/teams";
import type { ValidationResult } from "../types/types";
import { validators } from "./common";

export const teamsValidators = {
  args: {
    createTeams: {
      data: v.object({
        tournamentId: v.id("tournaments"),
        tourCardId: v.id("tourCards"),
        golferIds: v.array(v.number()),
        earnings: v.optional(v.number()),
        points: v.optional(v.number()),
        makeCut: v.optional(v.number()),
        position: v.optional(v.string()),
        pastPosition: v.optional(v.string()),
        score: v.optional(v.number()),
        topTen: v.optional(v.number()),
        topFive: v.optional(v.number()),
        topThree: v.optional(v.number()),
        win: v.optional(v.number()),
        today: v.optional(v.number()),
        thru: v.optional(v.number()),
        round: v.optional(v.number()),
        roundOneTeeTime: v.optional(v.string()),
        roundOne: v.optional(v.number()),
        roundTwoTeeTime: v.optional(v.string()),
        roundTwo: v.optional(v.number()),
        roundThreeTeeTime: v.optional(v.string()),
        roundThree: v.optional(v.number()),
        roundFourTeeTime: v.optional(v.string()),
        roundFour: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          setActive: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeTournament: v.optional(v.boolean()),
          includeMember: v.optional(v.boolean()),
        }),
      ),
    },
    getTeams: {
      options: v.optional(
        v.object({
          id: v.optional(v.id("teams")),
          ids: v.optional(v.array(v.id("teams"))),
          filter: v.optional(
            v.object({
              tournamentId: v.optional(v.id("tournaments")),
              tourCardId: v.optional(v.id("tourCards")),
              minEarnings: v.optional(v.number()),
              maxEarnings: v.optional(v.number()),
              minPoints: v.optional(v.number()),
              maxPoints: v.optional(v.number()),
              minScore: v.optional(v.number()),
              maxScore: v.optional(v.number()),
              position: v.optional(v.string()),
              round: v.optional(v.number()),
              makeCut: v.optional(v.number()),
              hasTopTen: v.optional(v.boolean()),
              hasWin: v.optional(v.boolean()),
              golferCount: v.optional(v.number()),
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
                  v.literal("earnings"),
                  v.literal("points"),
                  v.literal("score"),
                  v.literal("position"),
                  v.literal("today"),
                  v.literal("round"),
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
              includeTournament: v.optional(v.boolean()),
              includeTourCard: v.optional(v.boolean()),
              includeMember: v.optional(v.boolean()),
              includeGolfers: v.optional(v.boolean()),
              includeStatistics: v.optional(v.boolean()),
              includeRounds: v.optional(v.boolean()),
            }),
          ),
          activeOnly: v.optional(v.boolean()),
          tournamentOnly: v.optional(v.boolean()),
          includeAnalytics: v.optional(v.boolean()),
        }),
      ),
    },
    getTournamentTeams: {
      tournamentId: v.id("tournaments"),
    },
    getTournamentTeamsPage: {
      tournamentId: v.id("tournaments"),
      cursor: v.optional(v.union(v.string(), v.null())),
      limit: v.optional(v.number()),
    },
    adminSeedTeamsForTournamentFromTourCards: {
      tournamentId: v.optional(v.id("tournaments")),
      tournamentName: v.optional(v.string()),
      seasonId: v.optional(v.id("seasons")),
      tourId: v.optional(v.id("tours")),
      golferCount: v.optional(v.number()),
      maxTeams: v.optional(v.number()),
      seed: v.optional(v.number()),
      dryRun: v.optional(v.boolean()),
      skipExisting: v.optional(v.boolean()),
      allowFallbackToAllGolfers: v.optional(v.boolean()),
    },
    getTeamsPage: {
      filter: v.object({
        tournamentId: v.optional(v.id("tournaments")),
        tourCardId: v.optional(v.id("tourCards")),
      }),
      cursor: v.optional(v.union(v.string(), v.null())),
      limit: v.optional(v.number()),
    },
    getSeasonStandings: {
      seasonId: v.id("seasons"),
    },
    getChampionshipWinsForMember: {
      memberId: v.id("members"),
      seasonId: v.optional(v.id("seasons")),
    },
    updateTeams: {
      teamId: v.id("teams"),
      data: v.object({
        golferIds: v.optional(v.array(v.number())),
        earnings: v.optional(v.number()),
        points: v.optional(v.number()),
        makeCut: v.optional(v.number()),
        position: v.optional(v.string()),
        pastPosition: v.optional(v.string()),
        score: v.optional(v.number()),
        topTen: v.optional(v.number()),
        topFive: v.optional(v.number()),
        topThree: v.optional(v.number()),
        win: v.optional(v.number()),
        today: v.optional(v.number()),
        thru: v.optional(v.number()),
        round: v.optional(v.number()),
        roundOneTeeTime: v.optional(v.string()),
        roundOne: v.optional(v.number()),
        roundTwoTeeTime: v.optional(v.string()),
        roundTwo: v.optional(v.number()),
        roundThreeTeeTime: v.optional(v.string()),
        roundThree: v.optional(v.number()),
        roundFourTeeTime: v.optional(v.string()),
        roundFour: v.optional(v.number()),
      }),
      options: v.optional(
        v.object({
          skipValidation: v.optional(v.boolean()),
          updateTimestamp: v.optional(v.boolean()),
          returnEnhanced: v.optional(v.boolean()),
          includeStatistics: v.optional(v.boolean()),
          includeTournament: v.optional(v.boolean()),
          includeMember: v.optional(v.boolean()),
          includeGolfers: v.optional(v.boolean()),
        }),
      ),
    },
    deleteTeams: {
      teamId: v.id("teams"),
      options: v.optional(
        v.object({
          softDelete: v.optional(v.boolean()),
          returnDeletedData: v.optional(v.boolean()),
        }),
      ),
    },
  },
  validateTeamData: (data: ValidateTeamDataInput): ValidationResult => {
    const errors: string[] = [];

    if (data.golferIds && data.golferIds.length === 0) {
      errors.push("At least one golfer must be selected");
    }

    if (
      data.golferIds &&
      data.golferIds.some((id) => !Number.isInteger(id) || id <= 0)
    ) {
      errors.push("All golfer IDs must be positive integers");
    }

    const earningsErr = validators.positiveNumber(data.earnings, "Earnings");
    if (earningsErr) errors.push(earningsErr);

    const pointsErr = validators.positiveNumber(data.points, "Points");
    if (pointsErr) errors.push(pointsErr);

    const roundErr = validators.numberRange(data.round, 1, 4, "Round");
    if (roundErr) errors.push(roundErr);

    return { isValid: errors.length === 0, errors };
  },
} as const;
