import { HardGateAdmin } from "@/displays";
import { api, Id } from "@/convex";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation } from "convex/react";
import { useState } from "react";

export const Route = createFileRoute("/admin")({
  component: AdminRoute,
});

function AdminRoute() {
  const runCreateGroups = useAction(
    api.functions.cronJobs.runCreateGroupsForNextTournament_Public,
  );
  const runLiveSync = useAction(
    api.functions.cronJobs.runLiveTournamentSync_Public,
  );
  const runUpdateWorldRank = useAction(
    api.functions.cronJobs.updateGolfersWorldRankFromDataGolfInput_Public,
  );
  const runRecomputeStandings = useMutation(
    api.functions.cronJobs.recomputeStandingsForCurrentSeason_Public,
  );
  const importTeamsFromJson = useMutation(
    api.functions.teams.importTeamsFromJson,
  );
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [tournamentId, setTournamentId] = useState("");
  const [teamsJson, setTeamsJson] = useState("");
  const [importOutput, setImportOutput] = useState("");

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
