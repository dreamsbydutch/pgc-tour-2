import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/tanstack-react-start";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { TeamDoc, TournamentDoc } from "../../../convex/types/types";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import { AdminDataTable } from "@/components/admin/AdminDataTable";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const Route = createFileRoute("/admin/teams")({
  component: AdminTeamsPage,
});

function AdminTeamsPage() {
  const { isAdmin, isLoading: isRoleLoading } = useRoleAccess();

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
            <Card>
              <CardHeader>
                <CardTitle>Loading…</CardTitle>
              </CardHeader>
            </Card>
          ) : !isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Forbidden</CardTitle>
                <CardDescription>Admin access required.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <TeamsViewer />
          )}
        </SignedIn>
      </div>
    </div>
  );
}

function TeamsViewer() {
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

  const teams = useMemo(() => {
    return [...allTeams].sort((a, b) => (b.points ?? 0) - (a.points ?? 0));
  }, [allTeams]);

  return (
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
            value={tournamentId}
            onChange={(e) =>
              setTournamentId(e.target.value as Id<"tournaments"> | "")
            }
            className="w-full rounded-md border px-3 py-2 text-sm"
          >
            <option value="">All tournaments</option>
            {tournaments.map((t) => (
              <option key={t._id} value={t._id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>

        {!tournamentId ? (
          <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
            ⚠️ Please select a tournament to view teams. The paginated endpoint
            requires at least one filter.
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <AdminDataTable<TeamDoc>
            rows={teams}
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

        {tournamentId && !isDone && !isLoading ? (
          <div className="flex justify-center pt-4">
            <Button onClick={loadMore} disabled={isLoading}>
              Load more teams
            </Button>
          </div>
        ) : null}

        {tournamentId && isDone && teams.length > 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            All teams loaded ({teams.length} total)
          </p>
        ) : null}

        {tournamentId && isLoading ? (
          <p className="text-center text-sm text-muted-foreground">
            Loading...
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
