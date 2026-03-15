import { v } from "convex/values";
import { sortOrderValidator } from "./_shared";

const tournamentStatus = v.union(
  v.literal("upcoming"),
  v.literal("active"),
  v.literal("completed"),
  v.literal("cancelled"),
);

const tournamentReferenceFields = {
  tournamentId: v.id("tournaments"),
};

const tournamentReference = v.object(tournamentReferenceFields);
const tournamentSortBy = v.union(
  v.literal("name"),
  v.literal("startDate"),
  v.literal("endDate"),
  v.literal("status"),
);

const tournamentOptionalFields = {
  logoUrl: v.optional(v.string()),
  apiId: v.optional(v.string()),
  groupsEmailSentAt: v.optional(v.number()),
  reminderEmailSentAt: v.optional(v.number()),
  status: v.optional(tournamentStatus),
  currentRound: v.optional(v.number()),
  livePlay: v.optional(v.boolean()),
  dataGolfInPlayLastUpdate: v.optional(v.union(v.string(), v.number())),
  leaderboardLastUpdatedAt: v.optional(v.number()),
};

const tournamentCreateData = v.object({
  name: v.string(),
  startDate: v.number(),
  endDate: v.number(),
  tierId: v.id("tiers"),
  courseId: v.id("courses"),
  seasonId: v.id("seasons"),
  ...tournamentOptionalFields,
});

const tournamentUpdateData = v.object({
  name: v.optional(v.string()),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
  tierId: v.optional(v.id("tiers")),
  courseId: v.optional(v.id("courses")),
  seasonId: v.optional(v.id("seasons")),
  ...tournamentOptionalFields,
});

const getTournamentsOptions = v.optional(
  v.object({
    filter: v.optional(
      v.object({
        seasonId: v.optional(v.id("seasons")),
        status: v.optional(tournamentStatus),
      }),
    ),
    sort: v.optional(
      v.object({
        sortBy: v.optional(tournamentSortBy),
        sortOrder: v.optional(sortOrderValidator),
      }),
    ),
    enhance: v.optional(
      v.object({
        includeCourse: v.optional(v.boolean()),
        includeTier: v.optional(v.boolean()),
        includeSeason: v.optional(v.boolean()),
      }),
    ),
  }),
);

export const tournamentsValidators = {
  data: {
    tournamentCreateData,
    tournamentUpdateData,
  },
  args: {
    getTournament: tournamentReference,
    getTournaments: {
      options: getTournamentsOptions,
    },
    getTournamentGroups: tournamentReference,
    createTournament: {
      data: tournamentCreateData,
    },
    updateTournament: {
      ...tournamentReferenceFields,
      data: tournamentUpdateData,
    },
    deleteTournament: tournamentReference,
  },
} as const;
