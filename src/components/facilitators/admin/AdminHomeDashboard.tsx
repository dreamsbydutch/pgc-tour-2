import { useCallback, useEffect, useMemo, useState } from "react";

import { api, useAction, useQuery } from "@/convex";
import type { Id } from "@/convex";

import type { AdminDashboardView } from "@/lib";
import { ADMIN_FORM_CONTROL_CLASSNAME } from "@/lib/constants";
import { normalizeList } from "@/lib";

import { AdminPanel } from "@/displays";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/ui";

/**
 * AdminHomeDashboard
 *
 * Renders the admin “Home” dashboard shown at `/admin?view=dashboard`.
 *
 * This dashboard surfaces high-signal operational metrics for administrators:
 * - Clerk user count (fetched via Convex action hitting the Clerk API)
 * - Member counts (total/active/linked-to-Clerk)
 * - Tour card season-over-season retention and churn (based on unique members with at least one tour card)
 *
 * Data sources:
 * - Convex: `seasons.getSeasons` (season selector)
 * - Convex: `members.adminGetAdminDashboardStats` (member + tour card YoY stats)
 * - Convex: `members.adminGetClerkUserCount` (Clerk user count)
 *
 * @param props.activeView Current admin view (for highlighting shortcuts).
 * @param props.onViewChange Callback for switching admin views.
 * @returns A visual admin metrics dashboard.
 */
export function AdminHomeDashboard(props: {
  activeView: AdminDashboardView;
  onViewChange: (view: AdminDashboardView) => void;
}) {
  const vm = useAdminHomeDashboard();
  const growth = vm.memberGrowth;
  const previousSeasonLabel = vm.stats?.previousSeason
    ? `Previous (${vm.stats.previousSeason.year} #${vm.stats.previousSeason.number})`
    : "Previous";
  const thisYearLabel = growth?.nowYear
    ? `New members (${growth.nowYear})`
    : "New members";

  return (
    <div className="space-y-6">
      <AdminPanel
        activeView={props.activeView}
        onViewChange={props.onViewChange}
      />

      <Card>
        <CardHeader className="gap-2 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1">
            <CardTitle>Key Metrics</CardTitle>
            <CardDescription>
              Season stats are based on unique members with at least one tour
              card.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <Field label="Season">
              <select
                value={vm.seasonId}
                onChange={(e) =>
                  vm.setSeasonId(e.target.value as Id<"seasons"> | "")
                }
                className={ADMIN_FORM_CONTROL_CLASSNAME}
                disabled={vm.seasons.length === 0}
              >
                <option value="">Select season</option>
                {vm.seasons.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.year} - Season #{s.number}
                  </option>
                ))}
              </select>
            </Field>

            <Button
              type="button"
              variant="outline"
              disabled={vm.clerk.status === "loading"}
              onClick={() => vm.clerk.refresh()}
            >
              {vm.clerk.status === "loading"
                ? "Refreshing Clerk…"
                : "Refresh Clerk"}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-muted">
              <CardHeader className="space-y-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Clerk users
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-semibold tracking-tight">
                  {vm.clerk.status === "loading" ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    String(vm.clerk.count ?? 0)
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {vm.clerk.status === "loading"
                    ? "Loading…"
                    : vm.clerk.isCapped
                      ? `Capped at ${vm.clerk.cap.toLocaleString()}+`
                      : ""}
                </div>
              </CardContent>
            </Card>

            <Card className="border-muted">
              <CardHeader className="space-y-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Members
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-semibold tracking-tight">
                  {vm.stats ? (
                    vm.stats.members.totalMembers
                  ) : (
                    <Skeleton className="h-8 w-20" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {vm.stats
                    ? `${vm.stats.members.activeMembers} active`
                    : vm.seasonId
                      ? "Loading…"
                      : "Select a season"}
                </div>
              </CardContent>
            </Card>

            <Card className="border-muted">
              <CardHeader className="space-y-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Linked members
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-semibold tracking-tight">
                  {vm.stats ? (
                    vm.stats.members.membersWithClerkId
                  ) : (
                    <Skeleton className="h-8 w-20" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {vm.stats
                    ? `${vm.stats.members.membersWithoutClerkId} not linked`
                    : vm.seasonId
                      ? "Loading…"
                      : "Select a season"}
                </div>
              </CardContent>
            </Card>

            <Card className="border-muted">
              <CardHeader className="space-y-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Tour cards (this season)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-semibold tracking-tight">
                  {vm.stats ? (
                    vm.stats.tourCards.currentSeason.tourCardCount
                  ) : (
                    <Skeleton className="h-8 w-20" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {vm.stats
                    ? `${vm.stats.tourCards.currentSeason.uniqueMemberCount} members`
                    : vm.seasonId
                      ? "Loading…"
                      : "Select a season"}
                </div>
              </CardContent>
            </Card>

            <Card className="border-muted">
              <CardHeader className="space-y-1">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {thisYearLabel}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="text-2xl font-semibold tracking-tight">
                  {growth?.currentYear ? (
                    growth.currentYear.newMembers
                  ) : (
                    <Skeleton className="h-8 w-20" />
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {growth?.currentYear
                    ? typeof growth.currentYear.yoyNewMembersRate ===
                        "number" &&
                      Number.isFinite(growth.currentYear.yoyNewMembersRate)
                      ? `${Math.round(growth.currentYear.yoyNewMembersRate * 100)}% vs last year`
                      : "—"
                    : "Loading…"}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="border-muted">
            <CardHeader>
              <CardTitle className="text-base">Year over year</CardTitle>
              <CardDescription>
                Compares the selected season to the best-matching season from
                the previous year.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!vm.stats ? (
                <div className="text-sm text-muted-foreground">
                  {vm.seasonId
                    ? "Loading…"
                    : "Select a season to view YoY stats."}
                </div>
              ) : !vm.stats.tourCards.previousSeason ? (
                <div className="text-sm text-muted-foreground">
                  No previous-year season found for {vm.stats.season.year - 1}.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <Card className="border-muted">
                      <CardHeader className="space-y-1">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          {previousSeasonLabel}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <div className="text-2xl font-semibold tracking-tight">
                          {vm.stats.tourCards.previousSeason.uniqueMemberCount}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {`${vm.stats.tourCards.previousSeason.tourCardCount} tour cards`}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-muted">
                      <CardHeader className="space-y-1">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          {`Current (${vm.stats.season.year} #${vm.stats.season.number})`}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <div className="text-2xl font-semibold tracking-tight">
                          {vm.stats.tourCards.currentSeason.uniqueMemberCount}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {`${vm.stats.tourCards.currentSeason.tourCardCount} tour cards`}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-muted">
                      <CardHeader className="space-y-1">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Retained
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <div className="text-2xl font-semibold tracking-tight">
                          {vm.stats.tourCards.retainedMembers}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Had a card last year and this year
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-muted">
                      <CardHeader className="space-y-1">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          Churned
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <div className="text-2xl font-semibold tracking-tight">
                          {vm.stats.tourCards.churnedMembers}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Had a card last year, not this year
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <div className="font-medium">Turnover</div>
                      <div className="text-muted-foreground">
                        {typeof vm.stats.tourCards.churnRate === "number"
                          ? `${Math.round(vm.stats.tourCards.churnRate * 100)}%`
                          : "—"}
                      </div>
                    </div>
                    <div className="h-2 overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-red-500"
                        style={{
                          width:
                            typeof vm.stats.tourCards.churnRate === "number"
                              ? `${Math.max(
                                  0,
                                  Math.min(
                                    100,
                                    Math.round(
                                      vm.stats.tourCards.churnRate * 100,
                                    ),
                                  ),
                                )}%`
                              : "0%",
                        }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {vm.stats.tourCards.newMembersWithCards} new this year
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-muted">
            <CardHeader>
              <CardTitle className="text-base">Member growth</CardTitle>
              <CardDescription>
                New members by year (based on member creation time), plus total
                growth over time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!growth ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : growth.series.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No member history found.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Year</TableHead>
                      <TableHead className="w-28">New</TableHead>
                      <TableHead>Growth</TableHead>
                      <TableHead className="w-28">YoY</TableHead>
                      <TableHead className="w-32 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {growth.series.map((row) => {
                      const max = growth.maxNewMembers;
                      const pct =
                        max > 0
                          ? Math.max(
                              0,
                              Math.min(
                                100,
                                Math.round((row.newMembers / max) * 100),
                              ),
                            )
                          : 0;

                      const yoyLabel =
                        typeof row.yoyNewMembersRate === "number" &&
                        Number.isFinite(row.yoyNewMembersRate)
                          ? `${Math.round(row.yoyNewMembersRate * 100)}%`
                          : "—";

                      return (
                        <TableRow key={row.year}>
                          <TableCell className="font-medium">
                            {row.year}
                          </TableCell>
                          <TableCell>{row.newMembers}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                                <div
                                  className="h-full bg-emerald-500"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <div className="w-16 text-xs text-muted-foreground">
                                {row.newActiveMembers} active
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {yoyLabel}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.cumulativeMembers}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Hook backing `AdminHomeDashboard`.
 *
 * Fetches seasons for selection, derives a default season, fetches internal admin stats
 * for the chosen season, and fetches Clerk user count via an action.
 *
 * @returns View-model for `AdminHomeDashboard`.
 */
function useAdminHomeDashboard() {
  const seasonsResult = useQuery(api.functions.seasons.getSeasons, {
    options: {
      pagination: { limit: 50 },
      sort: { sortBy: "year", sortOrder: "desc" },
    },
  });

  const seasons = useMemo(() => {
    const list = normalizeList<unknown, "seasons">(
      seasonsResult as unknown,
      "seasons",
    );

    return list
      .map((s) => {
        if (!s || typeof s !== "object") return null;
        const rec = s as Record<string, unknown>;
        const id = rec._id;
        const year = rec.year;
        const number = rec.number;
        if (
          typeof id !== "string" ||
          typeof year !== "number" ||
          typeof number !== "number"
        ) {
          return null;
        }

        return { _id: id as Id<"seasons">, year, number };
      })
      .filter(
        (s): s is { _id: Id<"seasons">; year: number; number: number } =>
          s !== null,
      )
      .sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.number - a.number;
      });
  }, [seasonsResult]);

  const [seasonId, setSeasonId] = useState<Id<"seasons"> | "">("");

  useEffect(() => {
    if (!seasonId && seasons.length > 0) {
      setSeasonId(seasons[0]._id);
    }
  }, [seasonId, seasons]);

  const statsResult = useQuery(
    api.functions.members.adminGetAdminDashboardStats,
    seasonId ? { seasonId } : "skip",
  );

  const stats = useMemo(() => {
    if (!statsResult || typeof statsResult !== "object") return null;
    const rec = statsResult as Record<string, unknown>;
    if (rec.ok !== true) return null;

    const season = rec.season as
      | { seasonId: Id<"seasons">; year: number; number: number }
      | undefined;
    const previousSeason =
      (rec.previousSeason as
        | { seasonId: Id<"seasons">; year: number; number: number }
        | null
        | undefined) ?? null;
    const members = rec.members as
      | {
          totalMembers: number;
          activeMembers: number;
          membersWithClerkId: number;
          membersWithoutClerkId: number;
        }
      | undefined;
    const tourCards = rec.tourCards as
      | {
          currentSeason: { tourCardCount: number; uniqueMemberCount: number };
          previousSeason: {
            tourCardCount: number;
            uniqueMemberCount: number;
          } | null;
          retainedMembers: number;
          newMembersWithCards: number;
          churnedMembers: number;
          retentionRate: number | null;
          churnRate: number | null;
        }
      | undefined;

    if (!season || !members || !tourCards) return null;

    return {
      season,
      previousSeason,
      members,
      tourCards,
    };
  }, [statsResult]);

  const clerkCountAction = useAction(
    api.functions.members.adminGetClerkUserCount,
  );

  const memberGrowthResult = useQuery(
    api.functions.members.adminGetAdminDashboardMemberGrowthByYear,
    {},
  );

  const memberGrowth = useMemo(() => {
    if (!memberGrowthResult || typeof memberGrowthResult !== "object") {
      return null;
    }

    const rec = memberGrowthResult as Record<string, unknown>;
    if (rec.ok !== true) return null;

    const seriesRaw = rec.series;
    if (!Array.isArray(seriesRaw)) return null;

    const nowYear = typeof rec.nowYear === "number" ? rec.nowYear : null;

    const series = seriesRaw
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const r = row as Record<string, unknown>;
        const year = r.year;
        const newMembers = r.newMembers;
        const newActiveMembers = r.newActiveMembers;
        const newLinkedMembers = r.newLinkedMembers;
        const cumulativeMembers = r.cumulativeMembers;
        const yoyNewMembersDelta = r.yoyNewMembersDelta;
        const yoyNewMembersRate = r.yoyNewMembersRate;

        if (
          typeof year !== "number" ||
          typeof newMembers !== "number" ||
          typeof newActiveMembers !== "number" ||
          typeof newLinkedMembers !== "number" ||
          typeof cumulativeMembers !== "number"
        ) {
          return null;
        }

        return {
          year,
          newMembers,
          newActiveMembers,
          newLinkedMembers,
          cumulativeMembers,
          yoyNewMembersDelta:
            yoyNewMembersDelta === null ||
            typeof yoyNewMembersDelta === "number"
              ? yoyNewMembersDelta
              : null,
          yoyNewMembersRate:
            yoyNewMembersRate === null || typeof yoyNewMembersRate === "number"
              ? yoyNewMembersRate
              : null,
        };
      })
      .filter(
        (
          r,
        ): r is {
          year: number;
          newMembers: number;
          newActiveMembers: number;
          newLinkedMembers: number;
          cumulativeMembers: number;
          yoyNewMembersDelta: number | null;
          yoyNewMembersRate: number | null;
        } => r !== null,
      );

    const maxNewMembers = series.reduce(
      (max, r) => (r.newMembers > max ? r.newMembers : max),
      0,
    );

    const currentYear =
      typeof nowYear === "number"
        ? (series.find((r) => r.year === nowYear) ?? null)
        : null;

    return {
      nowYear,
      series,
      maxNewMembers,
      currentYear,
    };
  }, [memberGrowthResult]);
  const [clerk, setClerk] = useState<
    | { status: "loading"; count: null; isCapped: boolean; cap: number }
    | { status: "ready"; count: number; isCapped: boolean; cap: number }
  >({ status: "loading", count: null, isCapped: false, cap: 5000 });

  const refreshClerk = useCallback(async () => {
    setClerk((prev) => ({
      status: "loading",
      count: null,
      isCapped: prev.isCapped,
      cap: prev.cap,
    }));
    try {
      const res = await clerkCountAction({});
      setClerk({
        status: "ready",
        count: res.count,
        isCapped: res.isCapped,
        cap: res.cap,
      });
    } catch {
      setClerk({ status: "ready", count: 0, isCapped: false, cap: 5000 });
    }
  }, [clerkCountAction]);

  useEffect(() => {
    void refreshClerk();
  }, [refreshClerk]);

  return {
    seasons,
    seasonId,
    setSeasonId,
    stats,
    memberGrowth,
    clerk: {
      status: clerk.status,
      count: clerk.count,
      isCapped: clerk.isCapped,
      cap: clerk.cap,
      refresh: refreshClerk,
    },
  };
}
