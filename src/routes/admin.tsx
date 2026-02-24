import { HardGateAdmin } from "@/displays";
import { api, Id } from "@/convex";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUser } from "@clerk/tanstack-react-start";
import { useMemo, useState } from "react";
import { EnhancedMemberDoc } from "convex/types/types";

export const Route = createFileRoute("/admin")({
  component: AdminRoute,
});

function AdminRoute() {
  const { user } = useUser();

  const tournaments = useQuery(api.functions.tournaments.getAllTournaments, {});
  const members = useQuery(api.functions.members.getMembers, {
    options: {
      activeOnly: true,
      sort: { sortBy: "lastname", sortOrder: "asc" },
      pagination: { limit: 500, offset: 0 },
    },
  }) as EnhancedMemberDoc[] | null;
  const seasons = useQuery(api.functions.seasons.getSeasons, {
    options: { sort: { sortBy: "year", sortOrder: "desc" } },
  }) as { _id: string; year: number; number: number }[] | null;

  const sortedTournaments = useMemo(() => {
    const list = tournaments ?? [];
    return [...list].sort((a, b) => (b.startDate ?? 0) - (a.startDate ?? 0));
  }, [tournaments]);

  const runCreateGroups = useAction(
    api.functions.cronJobs.runCreateGroupsForNextTournament_Public,
  );
  const runLiveSync = useAction(
    api.functions.cronJobs.runTournamentSync_Public,
  );
  const runUpdateWorldRank = useAction(
    api.functions.cronJobs.recomputeStandings_Public,
  );
  const sendWeeklyRecapEmailTest = useAction(
    api.functions.emails.sendWeeklyRecapEmailTest,
  );
  const sendWeeklyRecapEmailToAll = useAction(
    api.functions.emails.adminSendWeeklyRecapEmailToActiveTourCards,
  );
  const runRepairTournament = useAction(
    api.functions.tournaments.repairTournamentScoresAndStandings,
  );
  const runRecomputeStandings = useMutation(
    api.functions.cronJobs.recomputeStandingsForCurrentSeason_Public,
  );
  const createTransaction = useMutation(
    api.functions.transactions.createTransactions,
  );
  const importTeamsFromJson = useMutation(
    api.functions.teams.importTeamsFromJson,
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

  const runJob = async (key: string, fn: () => Promise<unknown>) => {
    setOutputs((prev) => ({ ...prev, [key]: "Running..." }));
    try {
      const result = await fn();
      setOutputs((prev) => ({
        ...prev,
        [key]: JSON.stringify(result, null, 2),
      }));
    } catch (err) {
      setOutputs((prev) => ({
        ...prev,
        [key]: err instanceof Error ? err.message : "Unknown error",
      }));
    }
  };

  const runImport = async () => {
    setImportOutput("Running...");
    try {
      const result = await importTeamsFromJson({
        tournamentId: tournamentId.trim() as Id<"tournaments">,
        teamsJson,
      });
      setImportOutput(JSON.stringify(result, null, 2));
    } catch (err) {
      setImportOutput(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const runRoundTeeTimeMigration = async () => {
    const tables = ["teams", "tournamentGolfers"] as const;
    const aggregate: Record<
      (typeof tables)[number],
      { passes: number; scanned: number; converted: number; invalid: number }
    > = {
      teams: { passes: 0, scanned: 0, converted: 0, invalid: 0 },
      tournamentGolfers: { passes: 0, scanned: 0, converted: 0, invalid: 0 },
    };

    for (const table of tables) {
      let cursor: string | null = null;
      for (let pass = 0; pass < 100; pass += 1) {
        const args = {
          outputType: "number",
          target: table,
          cursor,
          pageSize: 250,
        } as unknown as Parameters<typeof runLiveSync>[0];

        const result = (await runLiveSync(args)) as {
          hasMore?: boolean;
          nextCursor?: string;
          summaries?: {
            teams?: { scanned?: number; converted?: number; invalid?: number };
            tournamentGolfers?: {
              scanned?: number;
              converted?: number;
              invalid?: number;
            };
          };
        };

        aggregate[table].passes += 1;
        const summary =
          table === "teams"
            ? result.summaries?.teams
            : result.summaries?.tournamentGolfers;
        aggregate[table].scanned += summary?.scanned ?? 0;
        aggregate[table].converted += summary?.converted ?? 0;
        aggregate[table].invalid += summary?.invalid ?? 0;

        if (!result.hasMore) {
          break;
        }

        cursor = result.nextCursor ?? null;
      }
    }

    return aggregate;
  };

  return (
    <HardGateAdmin>
      <div className="space-y-6">
        <div className="space-y-2">
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={() => runJob("createGroups", () => runCreateGroups({}))}
            type="button"
          >
            Run Create Groups
          </button>
          <textarea
            className="h-28 w-full rounded border p-2 text-xs"
            readOnly
            value={outputs.createGroups ?? ""}
          />
        </div>

        <div className="space-y-2">
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={() => runJob("liveSync", () => runLiveSync({}))}
            type="button"
          >
            Run Live Sync
          </button>
          <textarea
            className="h-28 w-full rounded border p-2 text-xs"
            readOnly
            value={outputs.liveSync ?? ""}
          />
        </div>

        <div className="space-y-2">
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={() =>
              runJob("updateWorldRank", () => runUpdateWorldRank({}))
            }
            type="button"
          >
            Update World Ranks
          </button>
          <textarea
            className="h-28 w-full rounded border p-2 text-xs"
            readOnly
            value={outputs.updateWorldRank ?? ""}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Weekly Recap Email</div>
          <textarea
            className="h-40 w-full rounded border p-2 text-sm"
            value={weeklyRecapBody}
            onChange={(event) => setWeeklyRecapBody(event.target.value)}
            placeholder="Email body"
          />
          <div className="flex gap-2">
            <button
              className="rounded bg-primary px-4 py-2 text-primary-foreground"
              onClick={() =>
                runJob("weeklyRecapTest", () =>
                  sendWeeklyRecapEmailTest({ customBlurb: weeklyRecapBody }),
                )
              }
              type="button"
            >
              Send Test (to me)
            </button>
            <button
              className="rounded bg-primary px-4 py-2 text-primary-foreground"
              onClick={() =>
                runJob("weeklyRecapSendAll", () =>
                  sendWeeklyRecapEmailToAll({ customBlurb: weeklyRecapBody }),
                )
              }
              type="button"
            >
              Send To Everyone
            </button>
          </div>
          <textarea
            className="h-28 w-full rounded border p-2 text-xs"
            readOnly
            value={outputs.weeklyRecapTest ?? ""}
          />
          <textarea
            className="h-28 w-full rounded border p-2 text-xs"
            readOnly
            value={outputs.weeklyRecapSendAll ?? ""}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">
            Create Payment Transaction
          </div>
          <select
            className="w-full rounded border px-3 py-2 text-sm"
            value={paymentMemberId}
            onChange={(event) => setPaymentMemberId(event.target.value)}
            disabled={!members}
          >
            <option value="">
              {members ? "Select a member" : "Loading members..."}
            </option>
            {(members ?? []).map((m) => (
              <option key={m._id} value={m._id}>
                {(m.fullName ?? m.email) as string}
              </option>
            ))}
          </select>
          <select
            className="w-full rounded border px-3 py-2 text-sm"
            value={paymentSeasonId}
            onChange={(event) => setPaymentSeasonId(event.target.value)}
            disabled={!seasons}
          >
            <option value="">
              {seasons ? "Select a season" : "Loading seasons..."}
            </option>
            {(seasons ?? []).map((s) => (
              <option key={s._id} value={s._id}>
                {`${s.year} (Season ${s.number})`}
              </option>
            ))}
          </select>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            value={paymentAmountDollars}
            onChange={(event) => setPaymentAmountDollars(event.target.value)}
            placeholder="Amount (dollars), e.g. 100 or 100.50"
            inputMode="decimal"
          />
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={() =>
              runJob("createPayment", async () => {
                const amount = Number(paymentAmountDollars);
                const cents = Math.round(amount * 100);
                if (!Number.isFinite(cents) || cents === 0) {
                  throw new Error("Amount must be a non-zero number");
                }
                return await createTransaction({
                  data: {
                    memberId: paymentMemberId as Id<"members">,
                    seasonId: paymentSeasonId as Id<"seasons">,
                    amount: cents,
                    transactionType: "Payment",
                    status: "completed",
                  },
                });
              })
            }
            type="button"
            disabled={
              paymentMemberId.trim().length === 0 ||
              paymentSeasonId.trim().length === 0 ||
              paymentAmountDollars.trim().length === 0
            }
          >
            Create Payment
          </button>
          <textarea
            className="h-28 w-full rounded border p-2 text-xs"
            readOnly
            value={outputs.createPayment ?? ""}
          />
        </div>

        <div className="space-y-2">
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={() =>
              runJob("recomputeStandings", () => runRecomputeStandings({}))
            }
            type="button"
          >
            Recompute Standings
          </button>
          <textarea
            className="h-28 w-full rounded border p-2 text-xs"
            readOnly
            value={outputs.recomputeStandings ?? ""}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">
            Repair Tournament Scores + Standings
          </div>
          <select
            className="w-full rounded border px-3 py-2 text-sm"
            value={repairTournamentId}
            onChange={(event) => setRepairTournamentId(event.target.value)}
            disabled={!tournaments}
          >
            <option value="">
              {tournaments ? "Select a tournament" : "Loading tournaments..."}
            </option>
            {sortedTournaments.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={() =>
              runJob("repairTournament", () =>
                runRepairTournament({
                  tournamentId: repairTournamentId as Id<"tournaments">,
                  clerkId: user?.id,
                }),
              )
            }
            type="button"
            disabled={repairTournamentId.trim().length === 0}
          >
            Repair Selected Tournament
          </button>
          <textarea
            className="h-28 w-full rounded border p-2 text-xs"
            readOnly
            value={outputs.repairTournament ?? ""}
          />
        </div>

        <div className="space-y-2">
          <div className="text-sm font-semibold">Import Teams (JSON)</div>
          <input
            className="w-full rounded border px-3 py-2 text-sm"
            value={tournamentId}
            onChange={(event) => setTournamentId(event.target.value)}
            placeholder="Tournament Id"
          />
          <textarea
            className="h-48 w-full rounded border p-2 text-xs"
            value={teamsJson}
            onChange={(event) => setTeamsJson(event.target.value)}
            placeholder='[{"golferIds":[...],"score":-9.2,...}]'
          />
          <button
            className="rounded bg-primary px-4 py-2 text-primary-foreground"
            onClick={runImport}
            type="button"
            disabled={
              tournamentId.trim().length === 0 || teamsJson.trim().length === 0
            }
          >
            Import Teams
          </button>
          <textarea
            className="h-28 w-full rounded border p-2 text-xs"
            readOnly
            value={importOutput}
          />
        </div>
      </div>
    </HardGateAdmin>
  );
}
