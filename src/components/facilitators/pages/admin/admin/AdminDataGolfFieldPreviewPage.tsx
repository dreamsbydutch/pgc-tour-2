import { useMemo, useState } from "react";

import { api, useAction, useQuery } from "@/convex";
import type { Id } from "@/convex";

import { Button } from "@/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui";

/**
 * Admin tool for previewing the DataGolf "field updates" payload used by the
 * `create_groups_for_next_tournament` cron job.
 *
 * Behavior:
 * - Calls `api.functions.cronJobs.adminRunCronJob` with `confirm=false` and
 *   `job="create_groups_for_next_tournament"`.
 * - Returns the cron target resolution and the raw DataGolf payload so you can inspect
 *   what will be used as input before any database writes.
 * - Supports an optional tournament override to preview against a specific tournament.
 *
 * Data sources:
 * - `api.functions.tournaments.getTournaments` (tournament selector)
 * - `api.functions.cronJobs.adminRunCronJob` (preview fetch)
 *
 * @returns Admin preview UI with a runner button and JSON output.
 */
export function AdminDataGolfFieldPreviewPage() {
  const vm = useAdminDataGolfFieldPreviewPage();

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Admin: DataGolf Field Preview
        </h1>

        <Card>
          <CardHeader>
            <CardTitle>Preview create-groups DataGolf input</CardTitle>
            <CardDescription>
              This does not write to the database (preview mode).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-sm font-medium">
                Tournament override (optional)
              </div>
              <select
                value={vm.tournamentId}
                onChange={(e) =>
                  vm.setTournamentId(e.target.value as Id<"tournaments"> | "")
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">(auto-detect upcoming tournament)</option>
                {vm.tournaments.map((t) => (
                  <option key={t._id} value={t._id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <Button onClick={vm.onRun} disabled={vm.isRunning}>
                {vm.isRunning ? "Fetching…" : "Fetch DataGolf field"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => vm.setLastResult(null)}
                disabled={vm.isRunning || vm.lastResult === null}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Output</CardTitle>
            <CardDescription>Last preview result (JSON)</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[520px] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
              {vm.lastResult
                ? JSON.stringify(vm.lastResult, null, 2)
                : "(no preview run yet)"}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * Loads tournaments for optional override and runs the create-groups cron job in
 * preview mode (no DB writes).
 */
function useAdminDataGolfFieldPreviewPage(): {
  tournaments: Array<{ _id: Id<"tournaments">; name: string }>;
  tournamentId: Id<"tournaments"> | "";
  setTournamentId: React.Dispatch<React.SetStateAction<Id<"tournaments"> | "">>;
  isRunning: boolean;
  lastResult: unknown | null;
  setLastResult: React.Dispatch<React.SetStateAction<unknown | null>>;
  onRun: () => Promise<void>;
} {
  const [tournamentId, setTournamentId] = useState<Id<"tournaments"> | "">("");
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<unknown | null>(null);

  const runCron = useAction(api.functions.cronJobs.adminRunCronJob);

  const tournamentsResult = useQuery(api.functions.tournaments.getTournaments, {
    options: {
      pagination: { limit: 200, offset: 0 },
      sort: { sortBy: "startDate", sortOrder: "desc" },
    },
  }) as unknown;

  const tournaments = useMemo(() => {
    const raw = tournamentsResult as unknown;
    const list = Array.isArray(raw)
      ? (raw as Array<{ _id: Id<"tournaments">; name: string } | null>).filter(
          (t): t is { _id: Id<"tournaments">; name: string } => t !== null,
        )
      : [];
    return list;
  }, [tournamentsResult]);

  async function onRun() {
    setIsRunning(true);
    try {
      const result = await runCron({
        job: "create_groups_for_next_tournament",
        confirm: false,
        ...(tournamentId ? { tournamentId } : {}),
      });
      setLastResult(result);
    } finally {
      setIsRunning(false);
    }
  }

  return {
    tournaments,
    tournamentId,
    setTournamentId,
    isRunning,
    lastResult,
    setLastResult,
    onRun,
  };
}
