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

crons.interval(
  "publish_due_pick_reminders",
  { minutes: 15 },
  internal.functions.notifications.publishDuePickReminders,
  {},
);

crons.interval(
  "repair_notification_deliveries",
  { minutes: 10 },
  internal.functions.notifications.repairDeliveries,
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

// Weekly golfer OWGR/country refresh (DataGolf -> golfers)
// NOTE: Convex cron schedules are interpreted in UTC.
// 11am ET during standard time corresponds to 16:00 UTC.
crons.cron(
  "update_golfers_world_rank_11am",
  "0 16 * * 1",
  internal.functions.cronJobs.updateGolfersWorldRankFromDataGolfInput,
  {},
);

export default crons;
