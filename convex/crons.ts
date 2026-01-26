import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Live tournament sync (DataGolf -> golfers/tournamentGolfers + tournament status)
// Self-gating: the job exits quickly if no active tournament is found.
crons.interval(
  "datagolf_live_sync",
  { minutes: 2 },
  internal.functions.cronJobs.runDataGolfLiveSync,
  {},
);

// Teams recompute (tournamentGolfers -> teams score/position/points/earnings)
crons.interval(
  "update_teams",
  { minutes: 2 },
  internal.functions.cronJobs.runUpdateTeamsForActiveTournament,
  {},
);

// Standings recompute (teams -> tourCards standings)
crons.cron(
  "recompute_standings",
  "0 4 * * *",
  internal.functions.cronJobs.recomputeStandingsForCurrentSeason,
  {},
);

// Pre-tournament grouping (field updates + rankings -> tournamentGolfers.group)
crons.cron(
  "create_groups_for_next_tournament",
  "0 10 * * 1",
  internal.functions.cronJobs.runCreateGroupsForNextTournament,
  {},
);

// crons.cron(
// "send_missing_team_reminders",
// "0 1 * * 4", // Runs every Thursday at 1:00 AM UTC (~8:00 PM Wednesday US/Eastern in standard time)
// internal.functions.emails.sendMissingTeamReminderForUpcomingTournament,
// {},
// );

export default crons;
