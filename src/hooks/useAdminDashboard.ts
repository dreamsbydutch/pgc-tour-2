import { useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";

import { api, type Id } from "@/convex";
import type {
  AdminConfirmationRequest,
  AdminOperationKey,
  AdminOperationRun,
  AdminTaskKey,
  StandingsBackfillResult,
  TeamMetadataBackfillResult,
  SettlementAdminFilter,
  SettlementFeedback,
  SettlementItemKind,
} from "@/types";
import {
  buildBulkEmailPreview,
  buildImportTeamsPreview,
  buildPaymentPreview,
  buildRepairPreview,
  toAdminOperationStatus,
  toLatestAdminOperationStatus,
} from "@/utils/adminOperations";
import { buildAdminHubOverview } from "@/utils/adminHub";

export function useAdminDashboard() {
  const dashboard = useQuery(api.functions.readModels.adminGetDashboard);
  const settlementRequests = useQuery(
    api.functions.settlements.adminListRequests,
  );
  const missingTeamReminderPreview = useQuery(
    api.functions.emails.adminGetMissingTeamReminderPreview,
    {},
  );
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
  const sendMissingTeamReminder = useAction(
    api.functions.emails.adminSendMissingTeamReminderForUpcomingTournament,
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
  const backfillTeamMetadata = useMutation(
    api.functions.migrations.adminBackfillTeamMetadata,
  );
  const createTransaction = useMutation(
    api.functions.transactions.createPayment,
  );
  const completeSettlementItem = useMutation(
    api.functions.settlements.adminCompleteItem,
  );
  const cancelSettlementRequest = useMutation(
    api.functions.settlements.adminCancelRequest,
  );
  const importTeamsFromJson = useMutation(
    api.functions.teams.adminImportTeamsFromJson,
  );

  const [runs, setRuns] = useState<
    Partial<Record<AdminOperationKey, AdminOperationRun>>
  >({});
  const [repairTournamentId, setRepairTournamentId] = useState("");
  const [tournamentId, setTournamentId] = useState("");
  const [teamsJson, setTeamsJson] = useState("");
  const [weeklyRecapBody, setWeeklyRecapBody] = useState("");
  const [paymentMemberId, setPaymentMemberId] = useState("");
  const [paymentSeasonId, setPaymentSeasonId] = useState("");
  const [paymentAmountDollars, setPaymentAmountDollars] = useState("");
  const [recomputeSeasonId, setRecomputeSeasonId] = useState("");
  const [settlementFilter, setSettlementFilter] =
    useState<SettlementAdminFilter>("open");
  const [settlementBusyKey, setSettlementBusyKey] = useState<string | null>(
    null,
  );
  const [settlementFeedback, setSettlementFeedback] =
    useState<SettlementFeedback | null>(null);
  const [activeTask, setActiveTask] = useState<AdminTaskKey | null>(null);
  const [confirmationOperation, setConfirmationOperation] = useState<
    AdminConfirmationRequest["operation"] | null
  >(null);

  const selectedPaymentMember = members?.find(
    (member) => member._id === paymentMemberId,
  );
  const selectedPaymentSeason = seasons?.find(
    (season) => season._id === paymentSeasonId,
  );
  const selectedRepairTournament = tournaments?.find(
    (tournament) => tournament._id === repairTournamentId,
  );
  const selectedImportTournament = tournaments?.find(
    (tournament) => tournament._id === tournamentId,
  );
  const visibleSettlementRequests = useMemo(() => {
    const rows = settlementRequests ?? [];
    if (settlementFilter === "all") return rows;
    if (settlementFilter === "open") {
      return rows.filter(
        (request) =>
          request.status === "pending" || request.status === "in_progress",
      );
    }
    return rows.filter((request) => request.status === settlementFilter);
  }, [settlementFilter, settlementRequests]);
  const openSettlementRequests = (settlementRequests ?? []).filter(
    (request) =>
      request.status === "pending" || request.status === "in_progress",
  );
  const pendingSettlementCount = openSettlementRequests.length;
  const pendingTransferTotal = openSettlementRequests.reduce(
    (total, request) =>
      total + (request.transferCompletedAt ? 0 : request.transferCents),
    0,
  );

  const previews = useMemo(
    () => ({
      weeklyRecapSendAll: buildBulkEmailPreview({
        tournamentName:
          dashboard?.weeklyRecapPreview?.tournamentName ?? undefined,
        recipientCount:
          dashboard === undefined
            ? undefined
            : (dashboard.weeklyRecapPreview?.recipientCount ?? 0),
        customBlurb: weeklyRecapBody,
      }),
      missingTeamReminderSend: (() => {
        const base = buildBulkEmailPreview({
          tournamentName:
            missingTeamReminderPreview && !missingTeamReminderPreview.skipped
              ? missingTeamReminderPreview.tournamentName
              : undefined,
          recipientCount:
            missingTeamReminderPreview === undefined
              ? undefined
              : missingTeamReminderPreview.skipped
                ? 0
                : missingTeamReminderPreview.recipientCount,
          customBlurb: "",
        });
        if (!missingTeamReminderPreview) return base;
        if (missingTeamReminderPreview.skipped) {
          const reason =
            missingTeamReminderPreview.reason === "playoff_roster_inherited"
              ? "This playoff roster carries over from the first playoff event."
              : "There is no upcoming tournament to remind members about.";
          return { ...base, warnings: [reason], canRun: false };
        }
        if (missingTeamReminderPreview.alreadySent) {
          return {
            ...base,
            warnings: [
              "The reminder has already been sent for this tournament.",
            ],
            canRun: false,
          };
        }
        if (!missingTeamReminderPreview.groupsEmailSent) {
          return {
            ...base,
            warnings: [
              "Send the weekly groups email before the picks reminder.",
            ],
            canRun: false,
          };
        }
        return base;
      })(),
      createPayment: buildPaymentPreview({
        memberName: selectedPaymentMember?.fullName,
        seasonName: selectedPaymentSeason
          ? `${selectedPaymentSeason.year} (Season ${selectedPaymentSeason.number})`
          : undefined,
        currentBalanceCents: selectedPaymentMember?.account,
        amountDollars: paymentAmountDollars,
      }),
      repairTournament: buildRepairPreview({
        tournamentName: selectedRepairTournament?.name,
        tournamentStatus: selectedRepairTournament?.status,
        tournamentStartDate: selectedRepairTournament?.startDate,
      }),
      importTeams: buildImportTeamsPreview({
        tournamentId,
        tournamentName: selectedImportTournament?.name,
        teamsJson,
      }),
    }),
    [
      dashboard,
      missingTeamReminderPreview,
      paymentAmountDollars,
      selectedImportTournament,
      selectedPaymentMember,
      selectedPaymentSeason,
      selectedRepairTournament,
      teamsJson,
      tournamentId,
      weeklyRecapBody,
    ],
  );

  const persistentRuns = dashboard?.recentRuns;
  const updateWorldRankRun =
    runs.updateWorldRank ?? persistentRuns?.updateWorldRank ?? undefined;
  const createGroupsRun =
    runs.createGroups ?? persistentRuns?.createGroups ?? undefined;
  const liveSyncRun = runs.liveSync ?? persistentRuns?.liveSync ?? undefined;
  const repairTournamentRun =
    runs.repairTournament ?? persistentRuns?.repairTournament ?? undefined;
  const operationStatus = {
    createGroups: toAdminOperationStatus(createGroupsRun),
    liveSync: toAdminOperationStatus(liveSyncRun),
    liveSyncForce: toAdminOperationStatus(runs.liveSyncForce),
    updateWorldRank: toAdminOperationStatus(updateWorldRankRun),
    weeklyRecapTest: toAdminOperationStatus(runs.weeklyRecapTest),
    weeklyRecapSendAll: toAdminOperationStatus(runs.weeklyRecapSendAll),
    missingTeamReminderSend: toAdminOperationStatus(
      runs.missingTeamReminderSend,
    ),
    createPayment: toAdminOperationStatus(runs.createPayment),
    recomputeStandings: toAdminOperationStatus(runs.recomputeStandings),
    backfillStandings: toAdminOperationStatus(runs.backfillStandings),
    backfillTeamMetadata: toAdminOperationStatus(runs.backfillTeamMetadata),
    repairTournament: toAdminOperationStatus(repairTournamentRun),
    importTeams: toAdminOperationStatus(runs.importTeams),
  } satisfies Record<
    AdminOperationKey,
    ReturnType<typeof toAdminOperationStatus>
  >;
  const groupStatus = {
    eventSetup: toLatestAdminOperationStatus([
      updateWorldRankRun,
      createGroupsRun,
    ]),
    liveSync: toLatestAdminOperationStatus([liveSyncRun, runs.liveSyncForce]),
    weeklyRecap: toLatestAdminOperationStatus([
      runs.weeklyRecapTest,
      runs.weeklyRecapSendAll,
    ]),
    standings: toLatestAdminOperationStatus([
      runs.recomputeStandings,
      runs.backfillStandings,
    ]),
  };
  const hubOverview = useMemo(
    () =>
      buildAdminHubOverview({
        now: Date.now(),
        appState: dashboard?.appState,
        focusTournament: dashboard?.focusTournament ?? undefined,
        recentLiveSync: liveSyncRun,
        pendingSettlementCount,
      }),
    [
      dashboard?.appState,
      dashboard?.focusTournament,
      liveSyncRun,
      pendingSettlementCount,
    ],
  );

  const confirmation = useMemo<AdminConfirmationRequest | null>(() => {
    switch (confirmationOperation) {
      case "weeklyRecapSendAll":
        return {
          operation: confirmationOperation,
          title: "Send the weekly recap to everyone?",
          description:
            "Review the recipient estimate and message details before starting the bulk send.",
          confirmLabel: "Send bulk email",
          preview: previews.weeklyRecapSendAll,
        };
      case "missingTeamReminderSend":
        return {
          operation: confirmationOperation,
          title: "Send the picks reminder?",
          description:
            "This emails only eligible active members who have not submitted their upcoming roster.",
          confirmLabel: "Send reminder",
          preview: previews.missingTeamReminderSend,
        };
      case "createPayment":
        return {
          operation: confirmationOperation,
          title: "Record this payment?",
          description:
            "This immediately creates a completed transaction and changes the member's balance.",
          confirmLabel: "Record payment",
          preview: previews.createPayment,
        };
      case "repairTournament":
        return {
          operation: confirmationOperation,
          title: "Repair this tournament?",
          description:
            "The repair can replace calculated results and update season standings.",
          confirmLabel: "Run repair",
          preview: previews.repairTournament,
        };
      case "importTeams":
        return {
          operation: confirmationOperation,
          title: "Import these teams?",
          description:
            "Matching teams will be overwritten and new team rows may be created.",
          confirmLabel: "Import teams",
          preview: previews.importTeams,
        };
      default:
        return null;
    }
  }, [confirmationOperation, previews]);

  async function runJob(key: AdminOperationKey, job: () => Promise<unknown>) {
    const startedAt = Date.now();
    setRuns((previous) => ({
      ...previous,
      [key]: { status: "running", startedAt, result: "Operation in progress…" },
    }));
    try {
      const result = await job();
      setRuns((previous) => ({
        ...previous,
        [key]: {
          status: "succeeded",
          startedAt,
          finishedAt: Date.now(),
          result: formatResult(result),
        },
      }));
    } catch (error) {
      setRuns((previous) => ({
        ...previous,
        [key]: {
          status: "failed",
          startedAt,
          finishedAt: Date.now(),
          result: error instanceof Error ? error.message : "Unknown error",
        },
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
    backfillTeamMetadata: () =>
      runJob("backfillTeamMetadata", async () => {
        let cursor: string | null = null;
        let scanned = 0;
        let updated = 0;
        let unchanged = 0;
        let missingTourCards = 0;
        do {
          const page: TeamMetadataBackfillResult = await backfillTeamMetadata({
            cursor,
            limit: 100,
          });
          scanned += page.scanned;
          updated += page.updated;
          unchanged += page.unchanged;
          missingTourCards += page.missingTourCards;
          cursor = page.isDone ? null : page.continueCursor;
          if (page.isDone) break;
        } while (cursor);
        return {
          scanned,
          updated,
          unchanged,
          missingTourCards,
          complete: true,
        };
      }),
  };

  async function runConfirmedOperation(
    operation: AdminConfirmationRequest["operation"],
  ) {
    switch (operation) {
      case "weeklyRecapSendAll":
        await runJob(operation, () =>
          sendWeeklyRecapEmailToAll({ customBlurb: weeklyRecapBody }),
        );
        break;
      case "missingTeamReminderSend":
        await runJob(operation, () => sendMissingTeamReminder({}));
        break;
      case "createPayment":
        await runJob(operation, async () => {
          const cents = Math.round(Number(paymentAmountDollars) * 100);
          if (!Number.isSafeInteger(cents) || cents === 0) {
            throw new Error("Amount must be a non-zero number");
          }
          return await createTransaction({
            memberId: paymentMemberId as Id<"members">,
            seasonId: paymentSeasonId as Id<"seasons">,
            amount: cents,
          });
        });
        break;
      case "repairTournament":
        await runJob(operation, () =>
          runRepairTournament({
            tournamentId: repairTournamentId as Id<"tournaments">,
          }),
        );
        break;
      case "importTeams":
        await runJob(operation, () =>
          importTeamsFromJson({
            tournamentId: tournamentId.trim() as Id<"tournaments">,
            teamsJson,
          }),
        );
        break;
    }
  }

  async function confirmOperation() {
    if (!confirmation?.preview.canRun) return;
    const operation = confirmation.operation;
    setConfirmationOperation(null);
    await runConfirmedOperation(operation);
  }

  async function completeSettlement(
    requestId: Id<"settlementRequests">,
    item: SettlementItemKind,
  ) {
    if (
      !globalThis.confirm(
        "Mark this allocation complete? This records the financial transaction and cannot be unchecked.",
      )
    ) {
      return;
    }
    const key = `${requestId}:${item}`;
    setSettlementBusyKey(key);
    setSettlementFeedback(null);
    try {
      await completeSettlementItem({ requestId, item });
      setSettlementFeedback({
        tone: "success",
        message: "Allocation marked complete.",
      });
    } catch (error) {
      setSettlementFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Unable to complete allocation.",
      });
    } finally {
      setSettlementBusyKey(null);
    }
  }

  async function cancelSettlement(requestId: Id<"settlementRequests">) {
    const reason = globalThis.prompt("Why is this request being cancelled?");
    if (!reason) return;
    const key = `${requestId}:cancel`;
    setSettlementBusyKey(key);
    setSettlementFeedback(null);
    try {
      await cancelSettlementRequest({ requestId, reason });
      setSettlementFeedback({
        tone: "success",
        message: "Settlement request cancelled.",
      });
    } catch (error) {
      setSettlementFeedback({
        tone: "error",
        message:
          error instanceof Error ? error.message : "Unable to cancel request.",
      });
    } finally {
      setSettlementBusyKey(null);
    }
  }

  return {
    tournaments,
    sortedTournaments,
    members,
    seasons,
    repairTournamentId,
    setRepairTournamentId,
    tournamentId,
    setTournamentId,
    teamsJson,
    setTeamsJson,
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
    previews,
    operationStatus,
    groupStatus,
    confirmation,
    activeTask,
    openTask: setActiveTask,
    closeTask: () => setActiveTask(null),
    hubOverview,
    settlementRequests,
    visibleSettlementRequests,
    settlementFilter,
    setSettlementFilter,
    pendingSettlementCount,
    pendingTransferTotal,
    settlementBusyKey,
    settlementFeedback,
    completeSettlement,
    cancelSettlement,
    requestConfirmation: setConfirmationOperation,
    dismissConfirmation: () => setConfirmationOperation(null),
    confirmOperation,
  };
}

function formatResult(result: unknown) {
  if (result === undefined) return "Completed successfully.";
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2);
}
