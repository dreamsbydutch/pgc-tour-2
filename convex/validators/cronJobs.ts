import { v } from "convex/values";

const CronJobNameValidator = v.union(
  v.literal("live_tournament_sync"),
  v.literal("recompute_standings"),
  v.literal("create_groups_for_next_tournament"),
);

export const cronJobsValidators = {
  args: {
    getGolferIdsByApiIds: {
      apiIds: v.array(v.number()),
    },
    updateGolfersWorldRanksFromRankings: {
      rankings: v.array(
        v.object({
          dg_id: v.number(),
          owgr_rank: v.number(),
          player_name: v.string(),
          country: v.optional(v.string()),
        }),
      ),
    },
    getCreateGroupsTarget: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    copyFromFirstPlayoff: {
      tournamentId: v.id("tournaments"),
      firstPlayoffTournamentId: v.id("tournaments"),
    },
    applyCreateGroups: {
      tournamentId: v.id("tournaments"),
      groups: v.array(
        v.object({
          groupNumber: v.number(),
          golfers: v.array(
            v.object({
              dgId: v.number(),
              playerName: v.string(),
              country: v.optional(v.string()),
              r1TeeTime: v.optional(v.string()),
              r2TeeTime: v.optional(v.string()),
              worldRank: v.optional(v.number()),
              skillEstimate: v.optional(v.number()),
            }),
          ),
        }),
      ),
    },
    runCreateGroupsForNextTournament: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    getActiveTournamentIdForCron: {},
    getTournamentNameForCron: {
      tournamentId: v.id("tournaments"),
    },
    getTournamentCourseParForCron: {
      tournamentId: v.id("tournaments"),
    },
    getTournamentDataGolfInPlayLastUpdateForCron: {
      tournamentId: v.id("tournaments"),
    },
    applyDataGolfLiveSync: {
      tournamentId: v.id("tournaments"),
      currentRound: v.optional(v.number()),
      eventName: v.optional(v.string()),
      dataGolfInPlayLastUpdate: v.optional(v.string()),
      roundIsRunning: v.optional(v.boolean()),
      field: v.array(
        v.object({
          am: v.number(),
          country: v.string(),
          course: v.optional(v.string()),
          dg_id: v.number(),
          dk_id: v.optional(v.string()),
          dk_salary: v.optional(v.number()),
          early_late: v.optional(v.number()),
          fd_id: v.optional(v.string()),
          fd_salary: v.optional(v.number()),
          flag: v.optional(v.string()),
          pga_number: v.optional(v.number()),
          player_name: v.string(),
          r1_teetime: v.optional(v.union(v.string(), v.null())),
          r2_teetime: v.optional(v.union(v.string(), v.null())),
          r3_teetime: v.optional(v.union(v.string(), v.null())),
          r4_teetime: v.optional(v.union(v.string(), v.null())),
          start_hole: v.optional(v.number()),
          unofficial: v.optional(v.number()),
          yh_id: v.optional(v.string()),
          yh_salary: v.optional(v.number()),
        }),
      ),
      rankings: v.array(
        v.object({
          am: v.number(),
          country: v.string(),
          datagolf_rank: v.number(),
          dg_id: v.number(),
          dg_skill_estimate: v.number(),
          owgr_rank: v.number(),
          player_name: v.string(),
          primary_tour: v.string(),
        }),
      ),
      liveStats: v.array(
        v.object({
          player_name: v.string(),
          country: v.optional(v.string()),
          course: v.optional(v.string()),
          dg_id: v.number(),
          current_pos: v.string(),
          current_score: v.number(),
          end_hole: v.number(),
          make_cut: v.number(),
          round: v.number(),
          thru: v.union(v.string(), v.number()),
          today: v.number(),
          top_10: v.optional(v.union(v.number(), v.null())),
          top_20: v.number(),
          top_5: v.number(),
          win: v.number(),
          R1: v.optional(v.union(v.number(), v.null())),
          R2: v.optional(v.union(v.number(), v.null())),
          R3: v.optional(v.union(v.number(), v.null())),
          R4: v.optional(v.union(v.number(), v.null())),
        }),
      ),
    },
    runLiveTournamentSync: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    recomputeStandingsForCurrentSeason: {},
    getActiveTournamentIdForTeamsCron: {},
    getTournamentSnapshotForTeamsCron: {
      tournamentId: v.id("tournaments"),
    },
    computePlayoffContext: {
      tournamentId: v.id("tournaments"),
    },
    applyTeamsUpdate: {
      tournamentId: v.id("tournaments"),
      updates: v.array(
        v.object({
          teamId: v.id("teams"),
          round: v.number(),
          roundOne: v.optional(v.number()),
          roundTwo: v.optional(v.number()),
          roundThree: v.optional(v.number()),
          roundFour: v.optional(v.number()),
          today: v.optional(v.number()),
          thru: v.optional(v.number()),
          score: v.optional(v.number()),
          position: v.optional(v.string()),
          pastPosition: v.optional(v.string()),
          points: v.optional(v.number()),
          earnings: v.optional(v.number()),
          makeCut: v.optional(v.number()),
          topTen: v.optional(v.number()),
          win: v.optional(v.number()),
          roundOneTeeTime: v.optional(v.string()),
          roundTwoTeeTime: v.optional(v.string()),
          roundThreeTeeTime: v.optional(v.string()),
          roundFourTeeTime: v.optional(v.string()),
        }),
      ),
    },
    runTeamsUpdateForTournament: {
      tournamentId: v.optional(v.id("tournaments")),
    },
    adminRunCronJob: {
      job: CronJobNameValidator,
      tournamentId: v.optional(v.id("tournaments")),
      confirm: v.boolean(),
    },
  },
} as const;
