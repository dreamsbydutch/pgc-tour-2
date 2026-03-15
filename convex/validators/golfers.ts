import { v } from "convex/values";
import { teeTimeValueValidator } from "./_shared";

const golferOptionalFields = {
  country: v.optional(v.string()),
  worldRank: v.optional(v.number()),
};

const tournamentGolferOptionalFields = {
  position: v.optional(v.string()),
  posChange: v.optional(v.number()),
  score: v.optional(v.number()),
  makeCut: v.optional(v.number()),
  topTen: v.optional(v.number()),
  win: v.optional(v.number()),
  earnings: v.optional(v.number()),
  today: v.optional(v.number()),
  thru: v.optional(v.number()),
  round: v.optional(v.number()),
  endHole: v.optional(v.number()),
  group: v.optional(v.number()),
  roundOneTeeTime: v.optional(teeTimeValueValidator),
  roundOne: v.optional(v.number()),
  roundTwoTeeTime: v.optional(teeTimeValueValidator),
  roundTwo: v.optional(v.number()),
  roundThreeTeeTime: v.optional(teeTimeValueValidator),
  roundThree: v.optional(v.number()),
  roundFourTeeTime: v.optional(teeTimeValueValidator),
  roundFour: v.optional(v.number()),
  rating: v.optional(v.number()),
  worldRank: v.optional(v.number()),
  usage: v.optional(v.number()),
};

const golferCreateData = v.object({
  apiId: v.number(),
  playerName: v.string(),
  ...golferOptionalFields,
});

const golferUpdateData = v.object({
  apiId: v.optional(v.number()),
  playerName: v.optional(v.string()),
  ...golferOptionalFields,
});

const tournamentGolferCreateData = v.object({
  golferId: v.id("golfers"),
  tournamentId: v.id("tournaments"),
  ...tournamentGolferOptionalFields,
});

const tournamentGolferUpdateData = v.object({
  golferId: v.optional(v.id("golfers")),
  tournamentId: v.optional(v.id("tournaments")),
  ...tournamentGolferOptionalFields,
});

const tournamentGolferInternalUpdateData = v.object({
  _id: v.id("tournamentGolfers"),
  golferId: v.optional(v.id("golfers")),
  tournamentId: v.optional(v.id("tournaments")),
  ...tournamentGolferOptionalFields,
});

const getGolfersOptions = v.optional(
  v.object({
    filter: v.optional(
      v.object({
        apiId: v.optional(v.number()),
        tournamentId: v.optional(v.id("tournaments")),
        seasonId: v.optional(v.id("seasons")),
        activeOnly: v.optional(v.boolean()),
      }),
    ),
  }),
);

const getTournamentGolfersOptions = v.optional(
  v.object({
    filter: v.optional(
      v.object({
        golferId: v.optional(v.id("golfers")),
        tournamentId: v.optional(v.id("tournaments")),
        seasonId: v.optional(v.id("seasons")),
        activeOnly: v.optional(v.boolean()),
      }),
    ),
  }),
);

export const golfersValidators = {
  data: {
    golferCreateData,
    golferUpdateData,
    tournamentGolferCreateData,
    tournamentGolferUpdateData,
    tournamentGolferInternalUpdateData,
  },
  args: {
    getGolfer: {
      golferId: v.id("golfers"),
    },
    getGolferByApiId: {
      apiId: v.number(),
    },
    getGolfers: {
      options: getGolfersOptions,
    },
    getTournamentGolfer: {
      tournamentGolferId: v.id("tournamentGolfers"),
    },
    getTournamentGolfers: {
      options: getTournamentGolfersOptions,
    },
    createGolfer: {
      data: golferCreateData,
    },
    updateGolfer: {
      golferId: v.id("golfers"),
      data: golferUpdateData,
    },
    deleteGolfer: {
      golferId: v.id("golfers"),
    },
    createTournamentGolfer: {
      data: tournamentGolferCreateData,
    },
    updateTournamentGolferAdmin: {
      tournamentGolferId: v.id("tournamentGolfers"),
      data: tournamentGolferUpdateData,
    },
    updateTournamentGolfer: {
      tournamentGolfer: tournamentGolferInternalUpdateData,
    },
    deleteTournamentGolfer: {
      tournamentGolferId: v.id("tournamentGolfers"),
    },
    createMissingTournamentGolfers: {
      tournamentId: v.id("tournaments"),
      golfers: v.array(
        v.object({
          dg_id: v.number(),
          player_name: v.string(),
          country: v.optional(v.string()),
          worldRank: v.optional(v.number()),
          dg_skill_estimate: v.optional(v.number()),
          r1_teetime: v.optional(teeTimeValueValidator),
          r2_teetime: v.optional(teeTimeValueValidator),
        }),
      ),
    },
  },
} as const;
