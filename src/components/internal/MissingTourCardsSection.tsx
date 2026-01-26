import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex";
import type { Id } from "@/convex";
import type { SeasonDoc } from "../../../convex/types/types";

import {
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
import { ADMIN_FORM_CONTROL_CLASSNAME } from "@/lib/constants";
import { normalizeList } from "@/lib";

/**
 * MissingTourCardsSection
 *
 * Admin reporting view that lists active members who do not have a tour card for a selected season,
 * and highlights members who had tour card(s) in the previous year.
 *
 * Data sources:
 * - Convex: `seasons.getSeasons` for the season dropdown.
 * - Convex: `tourCards.getActiveMembersMissingTourCards` for the report data.
 *
 * @returns A card containing season controls, summary counts, and a results table.
 */
export function MissingTourCardsSection() {
  const model = useMissingTourCardsSection();

  if (model.status === "loading") {
    return <MissingTourCardsSectionSkeleton />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Missing Tour Cards</CardTitle>
        <CardDescription>
          Active members without a tour card for the selected season.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Season">
            <select
              value={model.seasonId}
              onChange={(e) =>
                model.setSeasonId(e.target.value as Id<"seasons"> | "")
              }
              className={ADMIN_FORM_CONTROL_CLASSNAME}
            >
              <option value="">Select season</option>
              {model.seasons.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.year} - Season #{s.number}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Show">
            <select
              value={model.viewMode}
              onChange={(e) =>
                model.setViewMode(
                  e.target.value as "all" | "returning-only" | "new-only",
                )
              }
              className={ADMIN_FORM_CONTROL_CLASSNAME}
              disabled={!model.seasonId}
            >
              <option value="all">All missing</option>
              <option value="returning-only">
                Returning only (had last year)
              </option>
              <option value="new-only">New only (no last-year card)</option>
            </select>
          </Field>

          <Field label="Search">
            <input
              value={model.search}
              onChange={(e) => model.setSearch(e.target.value)}
              className={ADMIN_FORM_CONTROL_CLASSNAME}
              placeholder="Name or email"
              disabled={!model.seasonId}
            />
          </Field>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div className="rounded-md border p-3 text-sm">
            <div className="text-muted-foreground">Active members</div>
            <div className="text-lg font-semibold">{model.activeCount}</div>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="text-muted-foreground">Missing this season</div>
            <div className="text-lg font-semibold">{model.missingCount}</div>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="text-muted-foreground">Returning missing</div>
            <div className="text-lg font-semibold">
              {model.returningMissingCount}
            </div>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Last-year cards</TableHead>
              <TableHead className="text-right">Last login</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {model.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  {model.seasonId
                    ? "No matching members."
                    : "Select a season to view results."}
                </TableCell>
              </TableRow>
            ) : (
              model.rows.map((row) => (
                <TableRow
                  key={row.memberId}
                  className={
                    row.previousSeasonTourCardsCount > 0
                      ? "bg-amber-50"
                      : undefined
                  }
                >
                  <TableCell className="font-medium">
                    {row.displayName}
                  </TableCell>
                  <TableCell>{row.email}</TableCell>
                  <TableCell className="text-right">
                    {row.previousSeasonTourCardsCount}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.lastLoginLabel ?? "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * Fetches seasons and the missing-tour-cards report, and shapes it for `MissingTourCardsSection`.
 *
 * Previous season rule:
 * - “Last year” is the most recent season whose `year === selectedSeason.year - 1`.
 *
 * @returns View-model for `MissingTourCardsSection`.
 */
function useMissingTourCardsSection() {
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

  const [seasonId, setSeasonId] = useState<Id<"seasons"> | "">("");
  const [search, setSearch] = useState<string>("");
  const [viewMode, setViewMode] = useState<
    "all" | "returning-only" | "new-only"
  >("all");

  const defaultSeasonId = seasons[0]?._id ?? "";

  useEffect(() => {
    if (!seasonId && defaultSeasonId) {
      setSeasonId(defaultSeasonId);
    }
  }, [defaultSeasonId, seasonId]);

  const previousSeasonId = useMemo(() => {
    if (!seasonId) return null;

    const selectedSeason = seasons.find((s) => s._id === seasonId) ?? null;
    if (!selectedSeason) return null;

    const previousYear = selectedSeason.year - 1;
    const candidates = seasons.filter((s) => s.year === previousYear);
    if (candidates.length === 0) return null;

    const best = candidates.reduce((acc, cur) => {
      if (cur.number !== acc.number) return cur.number > acc.number ? cur : acc;

      const accStart = acc.startDate ?? 0;
      const curStart = cur.startDate ?? 0;
      if (curStart !== accStart) return curStart > accStart ? cur : acc;

      return cur._creationTime > acc._creationTime ? cur : acc;
    }, candidates[0]);

    return best._id as Id<"seasons">;
  }, [seasonId, seasons]);

  const report = useQuery(
    api.functions.tourCards.getActiveMembersMissingTourCards,
    seasonId
      ? {
          seasonId,
          ...(previousSeasonId ? { previousSeasonId } : {}),
        }
      : "skip",
  );

  const model = useMemo(() => {
    const raw = report as unknown;

    if (!seasonsResult) {
      return {
        status: "loading" as const,
        seasons: [] as SeasonDoc[],
        seasonId,
        setSeasonId,
        search,
        setSearch,
        viewMode,
        setViewMode,
        activeCount: 0,
        missingCount: 0,
        returningMissingCount: 0,
        rows: [] as Array<{
          memberId: Id<"members">;
          email: string;
          displayName: string;
          lastLoginLabel: string | null;
          previousSeasonTourCardsCount: number;
        }>,
      };
    }

    if (!seasonId) {
      return {
        status: "ready" as const,
        seasons,
        seasonId,
        setSeasonId,
        search,
        setSearch,
        viewMode,
        setViewMode,
        activeCount: 0,
        missingCount: 0,
        returningMissingCount: 0,
        rows: [],
      };
    }

    if (!raw || typeof raw !== "object" || !("members" in raw)) {
      return {
        status: "loading" as const,
        seasons,
        seasonId,
        setSeasonId,
        search,
        setSearch,
        viewMode,
        setViewMode,
        activeCount: 0,
        missingCount: 0,
        returningMissingCount: 0,
        rows: [],
      };
    }

    const data = raw as {
      activeMembersCount: number;
      missingCount: number;
      returningMissingCount: number;
      members: Array<{
        memberId: Id<"members">;
        email: string;
        firstname: string | null;
        lastname: string | null;
        lastLoginAt: number | null;
        previousSeasonTourCardsCount: number;
      }>;
    };

    const rows = data.members
      .map((m) => {
        const name = `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim();
        const displayName = name || m.email;
        const lastLoginLabel = m.lastLoginAt
          ? new Date(m.lastLoginAt).toLocaleString()
          : null;

        return {
          memberId: m.memberId,
          email: m.email,
          displayName,
          lastLoginLabel,
          previousSeasonTourCardsCount: m.previousSeasonTourCardsCount,
        };
      })
      .filter((row) => {
        if (viewMode === "returning-only") {
          return row.previousSeasonTourCardsCount > 0;
        }
        if (viewMode === "new-only") {
          return row.previousSeasonTourCardsCount === 0;
        }
        return true;
      })
      .filter((row) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
          row.displayName.toLowerCase().includes(q) ||
          row.email.toLowerCase().includes(q)
        );
      });

    return {
      status: "ready" as const,
      seasons,
      seasonId,
      setSeasonId,
      search,
      setSearch,
      viewMode,
      setViewMode,
      activeCount: data.activeMembersCount,
      missingCount: data.missingCount,
      returningMissingCount: data.returningMissingCount,
      rows,
    };
  }, [report, search, seasonId, seasons, seasonsResult, viewMode]);

  return model;
}

/** Loading UI for `MissingTourCardsSection`. */
function MissingTourCardsSectionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Missing Tour Cards</CardTitle>
        <CardDescription>
          <Skeleton className="h-4 w-64" />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </CardContent>
    </Card>
  );
}
