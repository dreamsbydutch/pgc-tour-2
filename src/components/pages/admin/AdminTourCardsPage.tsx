import { useMemo, useState } from "react";
import { SignedIn, SignedOut, SignInButton } from "@clerk/tanstack-react-start";

import { api, useMutation, useQuery } from "@/convex";
import type { Id } from "@/convex";
import type {
  SeasonDoc,
  TourCardDoc,
  TourDoc,
} from "../../../../convex/types/types";

import { useRoleAccess } from "@/hooks";
import { AdminDataTable } from "@/components/internal/AdminDataTable";
import { Button } from "@/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui";
import { normalizeList } from "@/lib";

/**
 * Admin page for managing tour cards and recomputing derived standings.
 *
 * Data sources:
 * - Convex: `seasons.getSeasons` for the season dropdown.
 * - Convex: `tours.getTours` and `tourCards.getTourCards` for browsing tour cards.
 * - Convex: `tourCards.recomputeTourCardsForSeasonAsAdmin` to recompute points/earnings/positions from teams.
 *
 * Major render states:
 * - Signed out: prompts for sign-in.
 * - Not admin: shows forbidden message.
 * - Ready: lets admins filter tour cards and trigger recomputation.
 */
export function AdminTourCardsPage() {
  const { isAdmin, isRoleLoading, vm } = useAdminTourCardsPage();
  const Skeleton = AdminTourCardsPageSkeleton;
  const roleLoadingNode = isRoleLoading ? Skeleton() : null;

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

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-6xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight">Admin: Tour Cards</h1>

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
          ) : !isAdmin ? (
            <Card>
              <CardHeader>
                <CardTitle>Forbidden</CardTitle>
                <CardDescription>Admin access required.</CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Tour Cards</CardTitle>
                <CardDescription>
                  Recompute points/earnings/positions based on current team
                  data.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Season">
                    <select
                      value={vm.seasonId}
                      onChange={(e) =>
                        vm.setSeasonId(e.target.value as Id<"seasons"> | "")
                      }
                      className="w-full rounded-md border px-3 py-2 text-sm"
                    >
                      <option value="">Select a season…</option>
                      {vm.seasons.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.year} #{s.number}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Tour (optional)">
                    <select
                      value={vm.tourId}
                      onChange={(e) =>
                        vm.setTourId(e.target.value as Id<"tours"> | "")
                      }
                      className="w-full rounded-md border px-3 py-2 text-sm"
                      disabled={!vm.seasonId}
                    >
                      <option value="">All tours</option>
                      {vm.tours.map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.shortForm}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    onClick={vm.recompute}
                    disabled={!vm.seasonId || vm.isRecomputing}
                  >
                    {vm.isRecomputing ? "Recomputing…" : "Recompute season"}
                  </Button>

                  {vm.lastResult ? (
                    <span className="text-sm text-muted-foreground">
                      Updated {vm.lastResult.tourCardsUpdated} tour cards
                      (completed tournaments:{" "}
                      {vm.lastResult.completedTournaments})
                    </span>
                  ) : null}
                </div>

                {!vm.seasonId ? (
                  <div className="rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
                    Please select a season before recomputing or browsing tour
                    cards.
                  </div>
                ) : null}

                <div className="overflow-x-auto">
                  <AdminDataTable<TourCardDoc>
                    rows={vm.tourCards}
                    emptyMessage={
                      vm.seasonId
                        ? "No tour cards found for that selection."
                        : "Select a season to view tour cards."
                    }
                    columns={[
                      {
                        id: "displayName",
                        header: "Display Name",
                        cell: (tc) => (
                          <span className="font-medium">{tc.displayName}</span>
                        ),
                      },
                      {
                        id: "tour",
                        header: "Tour",
                        cell: (tc) =>
                          vm.tourLabelById.get(String(tc.tourId)) ??
                          String(tc.tourId),
                      },
                      {
                        id: "points",
                        header: "Points",
                        cell: (tc) => tc.points ?? 0,
                      },
                      {
                        id: "earnings",
                        header: "Earnings",
                        cell: (tc) => `$${(tc.earnings / 100).toFixed(2)}`,
                      },
                      {
                        id: "position",
                        header: "Position",
                        cell: (tc) => tc.currentPosition ?? "—",
                      },
                      {
                        id: "playoff",
                        header: "Playoff",
                        cell: (tc) => {
                          const p = tc.playoff ?? 0;
                          if (p === 1) return "Gold";
                          if (p === 2) return "Silver";
                          return "—";
                        },
                      },
                      {
                        id: "memberId",
                        header: "Member",
                        cell: (tc) => (
                          <span className="block max-w-[220px] truncate">
                            {tc.memberId}
                          </span>
                        ),
                      },
                    ]}
                  />
                </div>
              </CardContent>
            </Card>
          )}
        </SignedIn>
      </div>
    </div>
  );
}

/**
 * Hook backing the tour cards admin page.
 *
 * Fetches seasons, tours, and tour cards for the selected season/tour. Also exposes a mutation to
 * recompute tour card aggregates from teams.
 */
function useAdminTourCardsPage() {
  const { isAdmin, isLoading: isRoleLoading } = useRoleAccess();

  const [seasonId, setSeasonId] = useState<Id<"seasons"> | "">("");
  const [tourId, setTourId] = useState<Id<"tours"> | "">("");

  const seasonsResult = useQuery(api.functions.seasons.getSeasons, {
    options: {
      pagination: { limit: 50 },
      sort: { sortBy: "year", sortOrder: "desc" },
    },
  });

  const seasons = useMemo(() => {
    const list = normalizeList<SeasonDoc, "seasons">(
      seasonsResult as unknown,
      "seasons",
    );
    return [...list].sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.number - a.number;
    });
  }, [seasonsResult]);

  const toursResult = useQuery(
    api.functions.tours.getTours,
    seasonId ? { options: { filter: { seasonId } } } : "skip",
  );

  const tours = useMemo(() => {
    const raw = toursResult as unknown;
    const list = Array.isArray(raw)
      ? (raw as Array<TourDoc | null>).filter((t): t is TourDoc => t !== null)
      : [];
    return list;
  }, [toursResult]);

  const tourLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tours) {
      map.set(String(t._id), t.shortForm);
    }
    return map;
  }, [tours]);

  const tourCardsResult = useQuery(
    api.functions.tourCards.getTourCards,
    seasonId
      ? {
          options: {
            seasonId,
            ...(tourId ? { tourId } : {}),
          },
        }
      : "skip",
  );

  const tourCards = useMemo(() => {
    const raw = tourCardsResult as unknown;
    const list = Array.isArray(raw)
      ? (raw as Array<TourCardDoc | null>).filter(
          (tc): tc is TourCardDoc => tc !== null,
        )
      : [];

    return [...list].sort((a, b) => {
      const aPoints = a.points ?? 0;
      const bPoints = b.points ?? 0;
      if (aPoints !== bPoints) return bPoints - aPoints;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [tourCardsResult]);

  const recomputeMutation = useMutation(
    api.functions.tourCards.recomputeTourCardsForSeasonAsAdmin,
  );

  const [isRecomputing, setIsRecomputing] = useState(false);
  const [lastResult, setLastResult] = useState<null | {
    tourCardsUpdated: number;
    completedTournaments: number;
  }>(null);

  const recompute = async () => {
    if (!seasonId) return;
    setIsRecomputing(true);
    try {
      const result = await recomputeMutation({ seasonId });
      setLastResult({
        tourCardsUpdated: result.tourCardsUpdated,
        completedTournaments: result.completedTournamentCount,
      });
    } finally {
      setIsRecomputing(false);
    }
  };

  return {
    isAdmin,
    isRoleLoading,
    vm: {
      seasonId,
      setSeasonId,
      tourId,
      setTourId,
      seasons,
      tours,
      tourLabelById,
      tourCards,
      recompute,
      isRecomputing,
      lastResult,
    },
  };
}

/** Admin tour cards loading state placeholder. */
function AdminTourCardsPageSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loading…</CardTitle>
      </CardHeader>
    </Card>
  );
}
