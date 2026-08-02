import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api, type Id } from "@/convex";
import type { StandingsBackfillResult } from "@/types";

export function useAdminDashboard() {
  const dashboard = useQuery(api.functions.readModels.adminGetDashboard);
  const tournaments = dashboard?.tournaments ?? null;
  const members = dashboard?.members ?? null;
  const seasons = dashboard?.seasons ?? null;
  const sortedTournaments = useMemo(
    () => [...(tournaments ?? [])].sort((a, b) => b.startDate - a.startDate),
    [tournaments],
  );

  const runCreateGroups = useAction(
    api.functions.cronJobs.runCreateGroupsForNextTournament_Public,
  );
  const runLiveSync = useAction(
    api.functions.cronJobs.runTournamentSync_Public,
  );
  const runUpdateWorldRank = useAction(
    api.functions.cronJobs.updateGolfersWorldRankFromDataGolfInput_Public,
  );
  const sendWeeklyRecapEmailTest = useAction(
    api.functions.emails.sendWeeklyRecapEmailTest,
  );
  const sendWeeklyRecapEmailToAll = useAction(
    api.functions.emails.adminSendWeeklyRecapEmailToActiveTourCards,
  );
  const runRepairTournament = useAction(
    api.functions.cronJobs.updatePreviousTournament_Public,
  );
  const runRecomputeStandings = useMutation(
    api.functions.cronJobs.recomputeStandings_Public,
  );
  const backfillStandings = useMutation(
    api.functions.standings.adminBackfillSeason,
  );
  const createTransaction = useMutation(
    api.functions.transactions.createPayment,
  );
  const importTeamsFromJson = useMutation(
    api.functions.teams.adminImportTeamsFromJson,
  );

  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [repairTournamentId, setRepairTournamentId] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [teamsJson, setTeamsJson] = useState("");
  const [importOutput, setImportOutput] = useState("");
  const [weeklyRecapBody, setWeeklyRecapBody] = useState("");
  const [paymentMemberId, setPaymentMemberId] = useState("");
  const [paymentSeasonId, setPaymentSeasonId] = useState("");
  const [paymentAmountDollars, setPaymentAmountDollars] = useState("");
  const [recomputeSeasonId, setRecomputeSeasonId] = useState("");

  async function runJob(key: string, job: () => Promise<unknown>) {
    setOutputs((previous) => ({ ...previous, [key]: "Running..." }));
    try {
      const result = await job();
      setOutputs((previous) => ({
        ...previous,
        [key]: JSON.stringify(result, null, 2),
      }));
    } catch (error) {
      setOutputs((previous) => ({
        ...previous,
        [key]: error instanceof Error ? error.message : "Unknown error",
      }));
    }
  }

  const jobs = {
    createGroups: () => runJob("createGroups", () => runCreateGroups({})),
    liveSync: (force = false) =>
      runJob(force ? "liveSyncForce" : "liveSync", () =>
        runLiveSync(force ? { force: true } : {}),
      ),
    updateWorldRank: () =>
      runJob("updateWorldRank", () => runUpdateWorldRank({})),
    weeklyRecapTest: () =>
      runJob("weeklyRecapTest", () =>
        sendWeeklyRecapEmailTest({ customBlurb: weeklyRecapBody }),
      ),
    weeklyRecapSendAll: () =>
      runJob("weeklyRecapSendAll", () =>
        sendWeeklyRecapEmailToAll({ customBlurb: weeklyRecapBody }),
      ),
    createPayment: () =>
      runJob("createPayment", async () => {
        const cents = Math.round(Number(paymentAmountDollars) * 100);
        if (!Number.isFinite(cents) || cents === 0) {
          throw new Error("Amount must be a non-zero number");
        }
        return await createTransaction({
          memberId: paymentMemberId as Id<"members">,
          seasonId: paymentSeasonId as Id<"seasons">,
          amount: cents,
        });
      }),
    recomputeStandings: () =>
      runJob("recomputeStandings", () =>
        runRecomputeStandings({
          seasonId: recomputeSeasonId
            ? (recomputeSeasonId as Id<"seasons">)
            : undefined,
        }),
      ),
    backfillStandings: () =>
      runJob("backfillStandings", async () => {
        if (!recomputeSeasonId) throw new Error("Select a season first");
        let cursor: string | null = null;
        let tourCards = 0;
        let contributions = 0;
        do {
          const page: StandingsBackfillResult = await backfillStandings({
            seasonId: recomputeSeasonId as Id<"seasons">,
            cursor,
            limit: 10,
          });
          cursor = page.isDone ? null : page.continueCursor;
          tourCards += page.tourCards;
          contributions += page.contributions;
          if (page.isDone) break;
        } while (cursor);
        return { tourCards, contributions, complete: true };
      }),
    repairTournament: () =>
      runJob("repairTournament", () =>
        runRepairTournament({
          tournamentId: repairTournamentId as Id<"tournaments">,
        }),
      ),
  };

  async function runImport() {
    setImportOutput("Running...");
    try {
      const result = await importTeamsFromJson({
        tournamentId: tournamentId.trim() as Id<"tournaments">,
        teamsJson,
      });
      setImportOutput(JSON.stringify(result, null, 2));
    } catch (error) {
      setImportOutput(error instanceof Error ? error.message : "Unknown error");
    }
  }

  return {
    tournaments,
    sortedTournaments,
    members,
    seasons,
    outputs,
    repairTournamentId,
    setRepairTournamentId,
    tournamentId,
    setTournamentId,
    teamsJson,
    setTeamsJson,
    importOutput,
    weeklyRecapBody,
    setWeeklyRecapBody,
    paymentMemberId,
    setPaymentMemberId,
    paymentSeasonId,
    setPaymentSeasonId,
    paymentAmountDollars,
    setPaymentAmountDollars,
    recomputeSeasonId,
    setRecomputeSeasonId,
    jobs,
    runImport,
  };
}
