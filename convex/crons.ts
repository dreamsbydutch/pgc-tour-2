import { cronJobs } from "convex/server";

import { internal } from "./_generated/api";

const crons = cronJobs();
const deployment = process.env.CONVEX_DEPLOYMENT ?? "";
const shouldRegisterCrons =
  !deployment.startsWith("dev:") && !deployment.startsWith("local:");

if (shouldRegisterCrons) {
  // Live tournament sync (DataGolf -> tournamentGolfers -> teams)
  // Self-gating: the job exits quickly if no active tournament is found.
  crons.interval(
    "live_tournament_sync",
    { minutes: 4 },
    internal.crons.sync.runTournamentSync,
    {},
  );

  // Standings recompute (teams -> tourCards standings)
  crons.cron(
    "recompute_standings",
    "0 4 * * *",
    internal.crons.standings.recomputeStandings,
    {},
  );

  // Pre-tournament grouping (field updates + rankings -> tournamentGolfers.group)
  crons.cron(
    "create_groups_for_next_tournament_12pm",
    "0 17 * * 1",
    internal.crons.groups.runCreateGroupsForNextTournament,
    {},
  );

  crons.cron(
    "create_groups_for_next_tournament_1pm",
    "0 18 * * 1",
    internal.crons.groups.runCreateGroupsForNextTournament,
    {},
  );

  crons.cron(
    "create_groups_for_next_tournament_2pm",
    "0 19 * * 1",
    internal.crons.groups.runCreateGroupsForNextTournament,
    {},
  );

  // Weekly golfer OWGR/country refresh (DataGolf -> golfers)
  // NOTE: Convex cron schedules are interpreted in UTC.
  // Noon UTC = 7am ET, which is early enough to update golfer info before the weekly tournament sync on Monday at 8am ET.
  crons.cron(
    "update_golfers_world_rank_11am",
    "0 12 * * 1",
    internal.crons.golfers.updateGolfersWorldRankFromDataGolfInput,
    {},
  );
}

export default crons;
