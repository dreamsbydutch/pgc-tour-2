import { v } from "convex/values";

const vFileFormat = v.union(v.literal("json"), v.literal("csv"));
const vOddsFormat = v.union(
  v.literal("percent"),
  v.literal("american"),
  v.literal("decimal"),
  v.literal("fraction"),
);
const vDisplay = v.union(v.literal("value"), v.literal("rank"));
const vTour = v.literal("pga");

const vFantasySite = v.union(
  v.literal("draftkings"),
  v.literal("fanduel"),
  v.literal("yahoo"),
);
const vFantasySlate = v.union(
  v.literal("main"),
  v.literal("showdown"),
  v.literal("showdown_late"),
  v.literal("weekend"),
  v.literal("captain"),
);

const vBettingMarketOutright = v.union(
  v.literal("win"),
  v.literal("top_5"),
  v.literal("top_10"),
  v.literal("top_20"),
  v.literal("mc"),
  v.literal("make_cut"),
  v.literal("frl"),
);
const vBettingMarketMatchups = v.union(
  v.literal("tournament_matchups"),
  v.literal("round_matchups"),
  v.literal("3_balls"),
);

const vBettingToolsAllPairingsTour = v.union(
  v.literal("pga"),
  v.literal("euro"),
  v.literal("opp"),
  v.literal("alt"),
);

const vHistoricalOddsTour = v.literal("pga");
const vHistoricalOddsOutrightsMarket = v.union(
  v.literal("win"),
  v.literal("top_5"),
  v.literal("top_10"),
  v.literal("top_20"),
  v.literal("make_cut"),
  v.literal("mc"),
);

const vHistoricalDfsTour = v.literal("pga");
const vHistoricalDfsSite = v.union(
  v.literal("draftkings"),
  v.literal("fanduel"),
);

const vHistoricalEventDataTour = v.literal("pga");

const vLiveStrokesGainedView = v.union(v.literal("raw"), v.literal("relative"));

export const datagolfValidators = {
  args: {
    fetchPlayerList: {
      options: v.optional(
        v.object({
          format: v.optional(vFileFormat),
          filterByCountry: v.optional(v.string()),
          filterByAmateur: v.optional(v.boolean()),
          sortByName: v.optional(v.boolean()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchTourSchedule: {
      options: v.optional(
        v.object({
          tour: v.optional(vTour),
          season: v.optional(v.number()),
          format: v.optional(vFileFormat),
          filterByLocation: v.optional(v.string()),
          sortByDate: v.optional(v.boolean()),
          upcomingOnly: v.optional(v.boolean()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchFieldUpdates: {
      options: v.optional(
        v.object({
          tour: v.optional(vTour),
          format: v.optional(vFileFormat),
          filterByCountry: v.optional(v.string()),
          filterWithdrawn: v.optional(v.boolean()),
          sortBySalary: v.optional(v.boolean()),
          sortByName: v.optional(v.boolean()),
          minSalary: v.optional(v.number()),
          maxSalary: v.optional(v.number()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchDataGolfRankings: {
      options: v.optional(
        v.object({
          format: v.optional(vFileFormat),
          filterByCountry: v.optional(v.string()),
          filterByTour: v.optional(v.string()),
          topN: v.optional(v.number()),
          minSkillEstimate: v.optional(v.number()),
          sortBySkill: v.optional(v.boolean()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchPreTournamentPredictions: {
      options: v.optional(
        v.object({
          tour: v.optional(vTour),
          addPosition: v.optional(v.array(v.number())),
          deadHeat: v.optional(v.boolean()),
          oddsFormat: v.optional(vOddsFormat),
          format: v.optional(vFileFormat),
          filterByCountry: v.optional(v.string()),
          minWinProbability: v.optional(v.number()),
          maxWinOdds: v.optional(v.number()),
          sortByWinProbability: v.optional(v.boolean()),
          model: v.optional(v.string()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchPlayerSkillDecompositions: {
      options: v.optional(
        v.object({
          tour: v.optional(vTour),
          format: v.optional(vFileFormat),
          filterByCountry: v.optional(v.string()),
          minPrediction: v.optional(v.number()),
          sortByPrediction: v.optional(v.boolean()),
          includeAdjustments: v.optional(v.boolean()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchSkillRatings: {
      options: v.optional(
        v.object({
          display: v.optional(vDisplay),
          format: v.optional(vFileFormat),
          filterByCountry: v.optional(v.string()),
          minTotalSG: v.optional(v.number()),
          sortByCategory: v.optional(v.string()),
          topNInCategory: v.optional(v.number()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchApproachSkill: {
      options: v.optional(
        v.object({
          period: v.optional(v.string()),
          format: v.optional(vFileFormat),
          filterByCountry: v.optional(v.string()),
          minShotCount: v.optional(v.number()),
          sortByProximity: v.optional(v.boolean()),
          distanceRange: v.optional(v.string()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchLiveModelPredictions: {
      options: v.optional(
        v.object({
          tour: v.optional(vTour),
          deadHeat: v.optional(v.boolean()),
          oddsFormat: v.optional(vOddsFormat),
          format: v.optional(vFileFormat),
          filterByPosition: v.optional(
            v.object({
              current: v.optional(v.string()),
              maxPosition: v.optional(v.number()),
            }),
          ),
          minWinProbability: v.optional(v.number()),
          sortByPosition: v.optional(v.boolean()),
          onlyActivePlayers: v.optional(v.boolean()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchLiveTournamentStats: {
      options: v.optional(
        v.object({
          stats: v.optional(v.array(v.string())),
          round: v.optional(v.string()),
          display: v.optional(vDisplay),
          format: v.optional(vFileFormat),
          filterByPosition: v.optional(v.number()),
          sortByStat: v.optional(v.string()),
          minValue: v.optional(
            v.object({
              stat: v.string(),
              value: v.number(),
            }),
          ),
          onlyCompleteRounds: v.optional(v.boolean()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchLiveHoleStats: {
      options: v.optional(
        v.object({
          tour: v.optional(vTour),
          format: v.optional(vFileFormat),
          filterByHole: v.optional(v.number()),
          filterByPar: v.optional(v.number()),
          sortByDifficulty: v.optional(v.boolean()),
          wave: v.optional(v.string()),
        }),
      ),
    },
    fetchHistoricalEventList: {
      options: v.optional(
        v.object({
          format: v.optional(vFileFormat),
          filterByTour: v.optional(v.string()),
          filterByYear: v.optional(v.number()),
          onlyWithSG: v.optional(v.boolean()),
          sortByDate: v.optional(v.boolean()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchHistoricalRoundData: {
      options: v.object({
        tour: v.string(),
        eventId: v.union(v.string(), v.number()),
        year: v.number(),
        format: v.optional(vFileFormat),
        filterByPlayer: v.optional(v.string()),
        filterByRound: v.optional(v.number()),
        minScore: v.optional(v.number()),
        maxScore: v.optional(v.number()),
        sortByScore: v.optional(v.boolean()),
        includeStats: v.optional(v.boolean()),
        limit: v.optional(v.number()),
        skip: v.optional(v.number()),
      }),
    },
    fetchHistoricalEventDataEvents: {
      options: v.object({
        tour: vHistoricalEventDataTour,
        eventId: v.number(),
        year: v.number(),
        format: v.optional(vFileFormat),
      }),
    },
    fetchPreTournamentPredictionsArchive: {
      options: v.optional(
        v.object({
          eventId: v.optional(v.union(v.string(), v.number())),
          year: v.optional(v.number()),
          oddsFormat: v.optional(vOddsFormat),
          format: v.optional(vFileFormat),
          model: v.optional(v.string()),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchFantasyProjectionDefaults: {
      options: v.optional(
        v.object({
          tour: v.optional(vTour),
          site: v.optional(vFantasySite),
          slate: v.optional(vFantasySlate),
          format: v.optional(vFileFormat),
          minSalary: v.optional(v.number()),
          maxSalary: v.optional(v.number()),
          sortBySalary: v.optional(v.boolean()),
          sortByProjection: v.optional(v.boolean()),
          filterByOwnership: v.optional(
            v.object({
              min: v.optional(v.number()),
              max: v.optional(v.number()),
            }),
          ),
          limit: v.optional(v.number()),
          skip: v.optional(v.number()),
        }),
      ),
    },
    fetchLiveStrokesGained: {
      options: v.optional(
        v.object({
          sg: v.optional(vLiveStrokesGainedView),
          format: v.optional(vFileFormat),
        }),
      ),
    },
    fetchBettingToolsOutrights: {
      options: v.object({
        market: vBettingMarketOutright,
        tour: v.optional(vTour),
        oddsFormat: v.optional(vOddsFormat),
        format: v.optional(vFileFormat),
      }),
    },
    fetchBettingToolsMatchups: {
      options: v.object({
        market: vBettingMarketMatchups,
        tour: v.optional(vTour),
        oddsFormat: v.optional(vOddsFormat),
        format: v.optional(vFileFormat),
      }),
    },
    fetchBettingToolsMatchupsAllPairings: {
      options: v.optional(
        v.object({
          tour: v.optional(vBettingToolsAllPairingsTour),
          oddsFormat: v.optional(vOddsFormat),
          format: v.optional(vFileFormat),
        }),
      ),
    },
    fetchHistoricalOddsEventList: {
      options: v.optional(
        v.object({
          tour: v.optional(vHistoricalOddsTour),
          format: v.optional(vFileFormat),
        }),
      ),
    },
    fetchHistoricalOddsOutrights: {
      options: v.object({
        market: vHistoricalOddsOutrightsMarket,
        book: v.string(),
        tour: v.optional(vHistoricalOddsTour),
        eventId: v.optional(v.union(v.string(), v.number())),
        year: v.optional(v.number()),
        oddsFormat: v.optional(vOddsFormat),
        format: v.optional(vFileFormat),
      }),
    },
    fetchHistoricalOddsMatchups: {
      options: v.object({
        book: v.string(),
        tour: v.optional(vHistoricalOddsTour),
        eventId: v.optional(v.union(v.string(), v.number())),
        year: v.optional(v.number()),
        oddsFormat: v.optional(vOddsFormat),
        format: v.optional(vFileFormat),
      }),
    },
    fetchHistoricalDfsEventList: {
      options: v.optional(
        v.object({
          format: v.optional(vFileFormat),
        }),
      ),
    },
    fetchHistoricalDfsPoints: {
      options: v.object({
        tour: vHistoricalDfsTour,
        eventId: v.union(v.string(), v.number()),
        year: v.number(),
        site: v.optional(vHistoricalDfsSite),
        format: v.optional(vFileFormat),
      }),
    },
  },
} as const;
