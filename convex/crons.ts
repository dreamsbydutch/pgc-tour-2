import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Repair the adaptive live-sync chain if a scheduled link is lost.
crons.interval(
  "repair_live_tournament_sync_chain",
  { minutes: 30 },
  internal.functions.cronJobs.runAdaptiveTournamentSync,
  { chainId: "repair", repair: true },
);

// Refresh the small timeline singleton and schedule the next exact start boundary.
crons.interval(
  "refresh_application_timeline",
  { minutes: 15 },
  internal.functions.readModels.refreshAppState,
  {},
);

// Standings recompute (teams -> tourCards standings)
crons.cron(
  "recompute_standings",
  "0 4 * * *",
  internal.functions.cronJobs.recomputeStandings,
  {},
);

// Pre-tournament grouping (field updates + rankings -> tournamentGolfers.group)
crons.cron(
  "create_groups_for_next_tournament",
  "0 17 * * 1",
  internal.functions.cronJobs.runCreateGroupsForNextTournamentWithRetry,
  { attempt: 0, trigger: "scheduled" },
);

// Daily complete golfer-directory + ranking refresh (DataGolf -> golfers).
// This runs before Monday grouping and is also safe to run manually.
crons.cron(
  "sync_golfer_directory_daily",
  "0 15 * * *",
  internal.functions.cronJobs.updateGolfersWorldRankFromDataGolfInput,
  {},
);

export default crons;
