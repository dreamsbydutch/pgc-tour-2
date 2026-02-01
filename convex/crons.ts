import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();

// Live tournament sync (DataGolf -> tournamentGolfers -> teams)
// Self-gating: the job exits quickly if no active tournament is found.
crons.interval(
  "live_tournament_sync",
  { minutes: 4 },
  internal.functions.cronJobs.runLiveTournamentSync,
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
  "create_groups_for_next_tournament_12pm",
  "0 17 * * 1",
  internal.functions.cronJobs.runCreateGroupsForNextTournament,
  {},
);

crons.cron(
  "create_groups_for_next_tournament_1pm",
  "0 18 * * 1",
  internal.functions.cronJobs.runCreateGroupsForNextTournament,
  {},
);

crons.cron(
  "create_groups_for_next_tournament_2pm",
  "0 19 * * 1",
  internal.functions.cronJobs.runCreateGroupsForNextTournament,
  {},
);

export default crons;
