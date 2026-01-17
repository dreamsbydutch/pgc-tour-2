import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/tanstack-react-start";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { TournamentDoc } from "../../../convex/types/types";

import { useRoleAccess } from "@/hooks/useRoleAccess";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/admin/crons")({
  component: AdminCronsPage,
});

type CronJobName =
  | "datagolf_live_sync"
  | "update_teams"
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

function AdminCronsPage() {
  const { isModerator, isLoading: isRoleLoading } = useRoleAccess();

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
          {isRoleLoading ? (
            <Card>
              <CardHeader>
                <CardTitle>Loading…</CardTitle>
              </CardHeader>
            </Card>
          ) : !isModerator ? (
            <Card>
              <CardHeader>
                <CardTitle>Forbidden</CardTitle>
                <CardDescription>
                  Moderator or admin access required.
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <CronRunner />
          )}
        </SignedIn>
      </div>
    </div>
  );
}

function CronRunner() {
  const runCronJob = useAction(api.functions.adminCron.adminRunCronJob);

  const tournamentsResult = useQuery(api.functions.tournaments.getTournaments, {
    options: {
      pagination: { limit: 200, offset: 0 },
      sort: { sortBy: "startDate", sortOrder: "desc" },
    },
  });

  const tournaments = useMemo(() => {
    const raw = tournamentsResult as unknown;
    const list = Array.isArray(raw)
      ? (raw as Array<TournamentDoc | null>).filter(
          (t): t is TournamentDoc => t !== null,
        )
      : [];
    return list;
  }, [tournamentsResult]);

  const [job, setJob] = useState<CronJobName>("datagolf_live_sync");
  const [tournamentId, setTournamentId] = useState<Id<"tournaments"> | "">("");
  const [confirm, setConfirm] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [lastResult, setLastResult] = useState<CronRunResult | null>(null);

  const wantsTournamentId =
    job === "datagolf_live_sync" ||
    job === "update_teams" ||
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

  return (
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
              value={job}
              onChange={(e) => setJob(e.target.value as CronJobName)}
              className="w-full rounded-md border px-3 py-2 text-sm"
            >
              <option value="datagolf_live_sync">datagolf_live_sync</option>
              <option value="update_teams">update_teams</option>
              <option value="recompute_standings">recompute_standings</option>
              <option value="create_groups_for_next_tournament">
                create_groups_for_next_tournament
              </option>
            </select>
          </div>

          {wantsTournamentId ? (
            <div className="space-y-2">
              <div className="text-sm font-medium">
                Tournament override (optional)
              </div>
              <select
                value={tournamentId}
                onChange={(e) =>
                  setTournamentId(e.target.value as Id<"tournaments"> | "")
                }
                className="w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="">(auto-detect)</option>
                {tournaments.map((t) => (
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
              checked={confirm}
              onChange={(e) => setConfirm(e.target.checked)}
            />
            I understand this will write to the database
          </label>

          <div className="flex items-center gap-3">
            <Button onClick={onRun} disabled={isRunning || !confirm}>
              {isRunning ? "Running…" : "Run job"}
            </Button>
            {!confirm ? (
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
            {lastResult ? JSON.stringify(lastResult, null, 2) : "(no runs yet)"}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
