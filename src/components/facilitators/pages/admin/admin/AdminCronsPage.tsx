import { useMemo, useState } from "react";

import { SignedIn, SignedOut, SignInButton } from "@clerk/tanstack-react-start";
import { api, useAction, useQuery } from "@/convex";
import type { Id } from "@/convex";

import { useRoleAccess } from "@/hooks";

import { Button } from "@/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui";

/**
 * Renders the `/admin/crons` page.
 *
 * This screen allows moderators/admins to manually trigger selected cron jobs.
 * It gates access via Clerk sign-in state and `useRoleAccess()`.
 *
 * Data sources:
 * - `api.functions.tournaments.getTournaments` (tournament selector)
 * - `api.functions.adminCron.adminRunCronJob` (run selected cron job)
 *
 * Major render states:
 * - Signed out (sign-in prompt)
 * - Signed in but role loading
 * - Signed in but forbidden
 * - Runner UI + JSON output
 */
export function AdminCronsPage() {
  const vm = useAdminCronsPage();

  if (vm.kind === "loading") {
    return <AdminCronsPageSkeleton />;
  }

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">
          Admin: Cron Test Environment
        </h1>

        <SignedOut>
          <Card>
            <CardHeader>
              <CardTitle>Sign in required</CardTitle>
              <CardDescription>
                You must be signed in to access admin tools.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SignInButton>
                <Button>Sign In</Button>
              </SignInButton>
            </CardContent>
          </Card>
        </SignedOut>

        <SignedIn>
          {vm.isRoleLoading ? (
            <Card>
              <CardHeader>
                <CardTitle>Loading…</CardTitle>
              </CardHeader>
            </Card>
          ) : !vm.isModerator ? (
            <Card>
              <CardHeader>
                <CardTitle>Forbidden</CardTitle>
                <CardDescription>
                  Moderator or admin access required.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Run a cron job</CardTitle>
                  <CardDescription>
                    These jobs mutate production data. Use with care.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Job</div>
                    <select
                      value={vm.job}
                      onChange={(e) =>
                        vm.setJob(e.target.value as typeof vm.job)
                      }
                      className="w-full rounded-md border px-3 py-2 text-sm"
                    >
                      <option value="live_tournament_sync">
                        live_tournament_sync
                      </option>
                      <option value="recompute_standings">
                        recompute_standings
                      </option>
                      <option value="create_groups_for_next_tournament">
                        create_groups_for_next_tournament
                      </option>
                    </select>
                  </div>

                  {vm.wantsTournamentId ? (
                    <div className="space-y-2">
                      <div className="text-sm font-medium">
                        Tournament override (optional)
                      </div>
                      <select
                        value={vm.tournamentId}
                        onChange={(e) =>
                          vm.setTournamentId(
                            e.target.value as Id<"tournaments"> | "",
                          )
                        }
                        className="w-full rounded-md border px-3 py-2 text-sm"
                      >
                        <option value="">(auto-detect)</option>
                        {vm.tournaments.map((t) => (
                          <option key={t._id} value={t._id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={vm.confirm}
                      onChange={(e) => vm.setConfirm(e.target.checked)}
                    />
                    I understand this will write to the database
                  </label>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={vm.onRun}
                      disabled={vm.isRunning || !vm.confirm}
                    >
                      {vm.isRunning ? "Running…" : "Run job"}
                    </Button>
                    {!vm.confirm ? (
                      <span className="text-xs text-muted-foreground">
                        Check the confirmation box to enable.
                      </span>
                    ) : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Output</CardTitle>
                  <CardDescription>Last run result (JSON)</CardDescription>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-[420px] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
                    {vm.lastResult
                      ? JSON.stringify(vm.lastResult, null, 2)
                      : "(no runs yet)"}
                  </pre>
                </CardContent>
              </Card>
            </div>
          )}
        </SignedIn>
      </div>
    </div>
  );
}

/**
 * Fetches role state, tournament list, and manages cron-runner state.
 */
function useAdminCronsPage():
  | { kind: "loading" }
  | {
      kind: "ready";
      isModerator: boolean;
      isRoleLoading: boolean;
      tournaments: Array<{ _id: Id<"tournaments">; name: string }>;
      job:
        | "live_tournament_sync"
        | "recompute_standings"
        | "create_groups_for_next_tournament";
      setJob: React.Dispatch<
        React.SetStateAction<
          | "live_tournament_sync"
          | "recompute_standings"
          | "create_groups_for_next_tournament"
        >
      >;
      tournamentId: Id<"tournaments"> | "";
      setTournamentId: React.Dispatch<
        React.SetStateAction<Id<"tournaments"> | "">
      >;
      confirm: boolean;
      setConfirm: React.Dispatch<React.SetStateAction<boolean>>;
      isRunning: boolean;
      lastResult: unknown;
      wantsTournamentId: boolean;
      onRun: () => Promise<void>;
    } {
  type CronJobName =
    | "live_tournament_sync"
    | "recompute_standings"
    | "create_groups_for_next_tournament";

  type CronRunResult =
    | {
        ok: true;
        job: CronJobName;
        startedAt: number;
        finishedAt: number;
        durationMs: number;
        result: unknown;
      }
    | {
        ok: false;
        job: CronJobName;
        startedAt: number;
        finishedAt: number;
        durationMs: number;
        error: { message: string; stack?: string };
      };

  const { isModerator, isLoading: isRoleLoading } = useRoleAccess();

  const runCronJob = useAction(api.functions.cronJobs.adminRunCronJob);

  const tournamentsResult = useQuery(api.functions.tournaments.getTournaments, {
    options: {
      pagination: { limit: 200, offset: 0 },
      sort: { sortBy: "startDate", sortOrder: "desc" },
    },
  });

  const tournaments = useMemo(() => {
    const raw = tournamentsResult as unknown;
    const list = Array.isArray(raw)
      ? (raw as Array<{ _id: Id<"tournaments">; name: string } | null>).filter(
          (t): t is { _id: Id<"tournaments">; name: string } => t !== null,
        )
      : [];
    return list;
  }, [tournamentsResult]);

  const [job, setJob] = useState<CronJobName>("live_tournament_sync");
  const [tournamentId, setTournamentId] = useState<Id<"tournaments"> | "">("");
  const [confirm, setConfirm] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CronRunResult | null>(null);

  const wantsTournamentId =
    job === "live_tournament_sync" ||
    job === "create_groups_for_next_tournament";

  async function onRun() {
    setIsRunning(true);
    setLastResult(null);

    try {
      const result = (await runCronJob({
        job,
        tournamentId:
          wantsTournamentId && tournamentId
            ? (tournamentId as Id<"tournaments">)
            : undefined,
        confirm,
      })) as CronRunResult;

      setLastResult(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setLastResult({
        ok: false,
        job,
        startedAt: Date.now(),
        finishedAt: Date.now(),
        durationMs: 0,
        error: { message },
      });
    } finally {
      setIsRunning(false);
    }
  }

  return {
    kind: "ready",
    isModerator,
    isRoleLoading,
    tournaments,
    job,
    setJob,
    tournamentId,
    setTournamentId,
    confirm,
    setConfirm,
    isRunning,
    lastResult,
    wantsTournamentId,
    onRun,
  };
}

/**
 * Loading state for the admin cron runner page.
 */
function AdminCronsPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="text-sm text-muted-foreground">Loading…</div>
    </div>
  );
}
