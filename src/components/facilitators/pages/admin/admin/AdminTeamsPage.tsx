import { useCallback, useEffect, useMemo, useState } from "react";
import { api, useMutation, useQuery } from "@/convex";
import { SignedIn, SignedOut, SignInButton } from "@clerk/tanstack-react-start";

import type { Id } from "@/convex";
import type {
  TeamDoc,
  TourDoc,
  TournamentDoc,
} from "../../../../../../convex/types/types";

import { useRoleAccess } from "@/hooks";
import { AdminDataTable } from "@/displays";
import { Button, Field } from "@/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui";

/**
 * Admin page for reading teams.
 *
 * @returns A role-gated view that pages through teams for a selected tournament.
 */
export function AdminTeamsPage() {
  const { isModerator, isAdmin, isRoleLoading, vm } = useAdminTeamsPage();
  const Skeleton = AdminTeamsPageSkeleton;
  const roleLoadingNode = isRoleLoading ? Skeleton() : null;

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Admin: Teams</h1>

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
            roleLoadingNode
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
            <Card>
              <CardHeader>
                <CardTitle>Teams</CardTitle>
                <CardDescription>
                  Read-only list. Filter by tournament to narrow down.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Tournament">
                  <select
                    value={vm.tournamentId}
                    onChange={(e) =>
                      vm.setTournamentId(
                        e.target.value as Id<"tournaments"> | "",
                      )
                    }
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  >
                    <option value="">All tournaments</option>
                    {vm.tournaments.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>

                {isAdmin ? (
                  <div className="space-y-4 rounded-md border bg-muted/30 p-4">
                    <div className="text-sm font-medium">
                      Seed teams from tour cards
                    </div>

                    {vm.tournamentId && vm.seedTours.length > 1 ? (
                      <Field label="Tour">
                        <select
                          value={vm.seedTourId}
                          onChange={(e) =>
                            vm.setSeedTourId(
                              e.target.value as Id<"tours"> | "",
                            )
                          }
                          className="w-full rounded-md border px-3 py-2 text-sm"
                        >
                          <option value="">Select a tour</option>
                          {vm.seedTours.map((t) => (
                            <option key={t._id} value={t._id}>
                              {t.shortForm} — {t.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : null}

                    <div className="grid gap-4 md:grid-cols-3">
                      <Field label="Golfers per team">
                        <input
                          value={vm.golferCountInput}
                          onChange={(e) => vm.setGolferCountInput(e.target.value)}
                          inputMode="numeric"
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          placeholder="6"
                        />
                      </Field>

                      <Field label="Seed">
                        <input
                          value={vm.seedInput}
                          onChange={(e) => vm.setSeedInput(e.target.value)}
                          inputMode="numeric"
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          placeholder="1"
                        />
                      </Field>

                      <Field label="Max teams (optional)">
                        <input
                          value={vm.maxTeamsInput}
                          onChange={(e) => vm.setMaxTeamsInput(e.target.value)}
                          inputMode="numeric"
                          className="w-full rounded-md border px-3 py-2 text-sm"
                          placeholder="All"
                        />
                      </Field>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={vm.skipExisting}
                          onChange={(e) => vm.setSkipExisting(e.target.checked)}
                        />
                        Skip existing teams
                      </label>

                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={vm.allowFallbackToAllGolfers}
                          onChange={(e) =>
                            vm.setAllowFallbackToAllGolfers(e.target.checked)
                          }
                        />
                        Allow fallback to all golfers
                      </label>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!vm.canSeed || vm.isSeeding}
                        onClick={() => vm.seedTeams(true)}
                      >
                        Preview
                      </Button>
                      <Button
                        type="button"
                        disabled={!vm.canSeed || vm.isSeeding}
                        onClick={() => vm.seedTeams(false)}
                      >
                        Create teams
                      </Button>

                      {vm.isSeeding ? (
                        <span className="text-sm text-muted-foreground">
                          Working...
                        </span>
                      ) : null}
                    </div>

                    {vm.seedError ? (
                      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                        {vm.seedError}
                      </div>
                    ) : null}

                    {vm.seedResult ? (
                      <div className="rounded-md border bg-background p-3 text-sm">
                        <div className="font-medium">
                          {vm.seedResult.dryRun
                            ? "Preview"
                            : "Created"}{" "}
                          {vm.seedResult.created} teams
                        </div>
                        <div className="text-muted-foreground">
                          Skipped: {vm.seedResult.skipped} • TourCards:{" "}
                          {vm.seedResult.totalTourCards} • Pool:{" "}
                          {vm.seedResult.golferPoolSource} ({vm.seedResult.golferPoolSize})
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {!vm.tournamentId ? (
                  <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                    ⚠️ Please select a tournament to view teams. The paginated
                    endpoint requires at least one filter.
                  </div>
                ) : null}

                <div className="overflow-x-auto">
                  <AdminDataTable<TeamDoc>
                    rows={vm.teams}
                    emptyMessage="No teams found."
                    columns={[
                      {
                        id: "team",
                        header: "Team",
                        cell: (t) => (
                          <span className="font-medium">{t.tourCardId}</span>
                        ),
                      },
                      {
                        id: "tourCard",
                        header: "TourCard",
                        cell: (t) => (
                          <span className="block max-w-[200px] truncate">
                            {t.tourCardId}
                          </span>
                        ),
                      },
                      {
                        id: "golfers",
                        header: "Golfers",
                        cell: (t) => t.golferIds?.length ?? 0,
                      },
                      {
                        id: "points",
                        header: "Points",
                        cell: (t) => t.points ?? "—",
                      },
                      {
                        id: "earnings",
                        header: "Earnings",
                        cell: (t) =>
                          typeof t.earnings === "number"
                            ? `$${(t.earnings / 100).toFixed(2)}`
                            : "—",
                      },
                      {
                        id: "score",
                        header: "Score",
                        cell: (t) => t.score ?? "—",
                      },
                      {
                        id: "position",
                        header: "Position",
                        cell: (t) => t.position ?? "—",
                      },
                    ]}
                  />
                </div>

                {vm.tournamentId && !vm.isDone && !vm.isLoading ? (
                  <div className="flex justify-center pt-4">
                    <Button onClick={vm.loadMore} disabled={vm.isLoading}>
                      Load more teams
                    </Button>
                  </div>
                ) : null}

                {vm.tournamentId && vm.isDone && vm.teams.length > 0 ? (
                  <p className="text-center text-sm text-muted-foreground">
                    All teams loaded ({vm.teams.length} total)
                  </p>
                ) : null}

                {vm.tournamentId && vm.isLoading ? (
                  <p className="text-center text-sm text-muted-foreground">
                    Loading...
                  </p>
                ) : null}
              </CardContent>
            </Card>
          )}
        </SignedIn>
      </div>
    </div>
  );
}

/**
 * Hook backing the teams admin page.
 *
 * Fetches tournaments for the dropdown and uses a paginated endpoint for teams.
 */
function useAdminTeamsPage() {
  const { isModerator, isAdmin, isLoading: isRoleLoading } = useRoleAccess();

  const seedTeamsMutation = useMutation(
    api.functions.teams.adminSeedTeamsForTournamentFromTourCards,
  );

  const [tournamentId, setTournamentId] = useState<Id<"tournaments"> | "">("");
  const [cursor, setCursor] = useState<string | null>(null);
  const [allTeams, setAllTeams] = useState<TeamDoc[]>([]);
  const [isDone, setIsDone] = useState(false);
  const [shouldFetch, setShouldFetch] = useState(false);

  useEffect(() => {
    setCursor(null);
    setAllTeams([]);
    setIsDone(false);
    setShouldFetch(!!tournamentId);
  }, [tournamentId]);

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

  const selectedTournament = useMemo(() => {
    if (!tournamentId) return null;
    return tournaments.find((t) => t._id === tournamentId) ?? null;
  }, [tournamentId, tournaments]);

  const seedToursResult = useQuery(
    api.functions.tours.getTours,
    selectedTournament
      ? {
          options: {
            filter: { seasonId: selectedTournament.seasonId },
            sort: { sortBy: "shortForm", sortOrder: "asc" },
            pagination: { limit: 50, offset: 0 },
          },
        }
      : "skip",
  );

  const seedTours = useMemo(() => {
    const raw = seedToursResult as unknown;
    const list = Array.isArray(raw)
      ? (raw as Array<TourDoc | null>).filter((t): t is TourDoc => t !== null)
      : [];
    return list;
  }, [seedToursResult]);

  const [seedTourId, setSeedTourId] = useState<Id<"tours"> | "">("");
  const [golferCountInput, setGolferCountInput] = useState("6");
  const [seedInput, setSeedInput] = useState("1");
  const [maxTeamsInput, setMaxTeamsInput] = useState("");
  const [skipExisting, setSkipExisting] = useState(true);
  const [allowFallbackToAllGolfers, setAllowFallbackToAllGolfers] =
    useState(true);

  const [seedError, setSeedError] = useState<string | null>(null);
  const [seedResult, setSeedResult] = useState<null | {
    tournamentId: Id<"tournaments">;
    tournamentName: string;
    seasonId: Id<"seasons">;
    tourId: Id<"tours">;
    tourShortForm: string;
    golferPoolSource: "tournamentGolfers" | "allGolfers";
    golferPoolSize: number;
    totalTourCards: number;
    created: number;
    skipped: number;
    dryRun: boolean;
  }>(null);
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    if (!tournamentId) {
      setSeedTourId("");
      return;
    }
    if (seedTours.length === 0) return;

    const currentIsValid = seedTourId
      ? seedTours.some((t) => t._id === seedTourId)
      : false;
    if (currentIsValid) return;

    const pga = seedTours.find((t) => t.shortForm.trim().toUpperCase() === "PGA");
    setSeedTourId(pga?._id ?? seedTours[0]._id);
  }, [seedTourId, seedTours, tournamentId]);

  const filter = useMemo(() => {
    const result: {
      tournamentId?: Id<"tournaments">;
      tourCardId?: Id<"tourCards">;
    } = {};
    if (tournamentId) result.tournamentId = tournamentId;
    return result;
  }, [tournamentId]);

  const pageResult = useQuery(
    api.functions.teams.getTeamsPage,
    tournamentId && shouldFetch ? { filter, cursor, limit: 200 } : "skip",
  );

  const isLoading = !!tournamentId && shouldFetch && pageResult === undefined;

  useEffect(() => {
    if (!shouldFetch) return;
    if (!pageResult) return;

    setAllTeams((prev) => {
      if (!pageResult.page.length) return prev;

      const seen = new Set<string>(prev.map((t) => t._id));
      const next = [...prev];

      for (const team of pageResult.page) {
        if (!seen.has(team._id)) {
          seen.add(team._id);
          next.push(team);
        }
      }

      return next;
    });

    setCursor(pageResult.continueCursor);
    setIsDone(pageResult.isDone);
    setShouldFetch(false);
  }, [pageResult, shouldFetch]);

  const loadMore = useCallback(() => {
    if (!tournamentId) return;
    if (isDone) return;
    if (allTeams.length > 0 && cursor === null) return;
    setShouldFetch(true);
  }, [allTeams.length, cursor, isDone, tournamentId]);

  const refreshTeams = useCallback(() => {
    if (!tournamentId) return;
    setCursor(null);
    setAllTeams([]);
    setIsDone(false);
    setShouldFetch(true);
  }, [tournamentId]);

  const teams = useMemo(() => {
    return [...allTeams].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  }, [allTeams]);

  const canSeed = useMemo(() => {
    if (!isAdmin) return false;
    if (!tournamentId) return false;
    if (seedTours.length > 1 && !seedTourId) return false;

    const golferCount = Number.parseInt(golferCountInput.trim() || "6", 10);
    if (!Number.isFinite(golferCount) || golferCount <= 0) return false;

    if (maxTeamsInput.trim()) {
      const maxTeams = Number.parseInt(maxTeamsInput.trim(), 10);
      if (!Number.isFinite(maxTeams) || maxTeams <= 0) return false;
    }

    if (seedInput.trim()) {
      const seed = Number.parseInt(seedInput.trim(), 10);
      if (!Number.isFinite(seed)) return false;
    }

    return true;
  }, [
    golferCountInput,
    isAdmin,
    maxTeamsInput,
    seedInput,
    seedTourId,
    seedTours.length,
    tournamentId,
  ]);

  const seedTeams = useCallback(
    async (dryRun: boolean) => {
      if (!tournamentId) return;

      setSeedError(null);
      setIsSeeding(true);

      const golferCount = Number.parseInt(golferCountInput.trim() || "6", 10);
      const seed = Number.parseInt(seedInput.trim() || "1", 10);
      const maxTeams = maxTeamsInput.trim()
        ? Number.parseInt(maxTeamsInput.trim(), 10)
        : undefined;

      try {
        const result = await seedTeamsMutation({
          tournamentId,
          tourId: seedTourId ? (seedTourId as Id<"tours">) : undefined,
          golferCount,
          seed,
          maxTeams,
          dryRun,
          skipExisting,
          allowFallbackToAllGolfers,
        });

        const r = result as unknown as {
          tournamentId: Id<"tournaments">;
          tournamentName: string;
          seasonId: Id<"seasons">;
          tourId: Id<"tours">;
          tourShortForm: string;
          golferPoolSource: "tournamentGolfers" | "allGolfers";
          golferPoolSize: number;
          totalTourCards: number;
          created: number;
          skipped: number;
          dryRun: boolean;
        };

        setSeedResult(r);
        if (!dryRun) refreshTeams();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Failed to seed teams";
        setSeedError(message);
      } finally {
        setIsSeeding(false);
      }
    },
    [
      allowFallbackToAllGolfers,
      golferCountInput,
      maxTeamsInput,
      refreshTeams,
      seedInput,
      seedTeamsMutation,
      seedTourId,
      skipExisting,
      tournamentId,
    ],
  );

  return {
    isModerator,
    isAdmin,
    isRoleLoading,
    vm: {
      tournamentId,
      setTournamentId,
      tournaments,
      seedTours,
      seedTourId,
      setSeedTourId,
      golferCountInput,
      setGolferCountInput,
      seedInput,
      setSeedInput,
      maxTeamsInput,
      setMaxTeamsInput,
      skipExisting,
      setSkipExisting,
      allowFallbackToAllGolfers,
      setAllowFallbackToAllGolfers,
      canSeed,
      isSeeding,
      seedTeams,
      seedError,
      seedResult,
      teams,
      loadMore,
      isDone,
      isLoading,
    },
  };
}

/** Admin teams loading state placeholder. */
function AdminTeamsPageSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loading…</CardTitle>
      </CardHeader>
    </Card>
  );
}
