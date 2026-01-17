import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Skeleton } from "./ui/skeleton";
import { cn, formatMoney, formatNumber, formatRank } from "@/lib/utils";
import type { TierDoc } from "../../convex/types/types";
import type { Id } from "../../convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { api } from "convex/_generated/api";

type TierRow = {
  key: string;
  name: string;
  payouts: number[];
  points: number[];
};

function useSeasonIdOrCurrent(seasonId?: Id<"seasons">) {
  const currentSeason = useQuery(api.functions.seasons.getCurrentSeason);

  const fallbackSeasonsResult = useQuery(
    api.functions.seasons.getSeasons,
    !seasonId && currentSeason === null
      ? {
          options: {
            pagination: { limit: 50 },
            sort: { sortBy: "year", sortOrder: "desc" },
          },
        }
      : "skip",
  );

  const fallbackSeasons = Array.isArray(fallbackSeasonsResult)
    ? fallbackSeasonsResult.filter((season) => season !== null)
    : fallbackSeasonsResult &&
        typeof fallbackSeasonsResult === "object" &&
        "seasons" in fallbackSeasonsResult
      ? (
          fallbackSeasonsResult as {
            seasons: Array<{
              year: number;
              number: number;
              _id: Id<"seasons">;
            } | null>;
          }
        ).seasons.filter(
          (
            season,
          ): season is { year: number; number: number; _id: Id<"seasons"> } =>
            season !== null,
        )
      : [];

  const fallbackSeasonId = fallbackSeasons.reduce<Id<"seasons"> | undefined>(
    (bestId, season) => {
      if (!bestId) return season._id;
      const best = fallbackSeasons.find((s) => s._id === bestId);
      if (!best) return season._id;
      if (season.year > best.year) return season._id;
      if (season.year < best.year) return bestId;
      if (season.number > best.number) return season._id;
      return bestId;
    },
    undefined,
  );

  return seasonId ?? currentSeason?._id ?? fallbackSeasonId;
}

/**
 * PayoutsTable Component
 *
 * Displays a table of payout distributions for each tier.
 * Adds a "Silver" tier if the Playoff tier has more than 75 payouts.
 */
export function PayoutsTable({ seasonId }: { seasonId?: Id<"seasons"> }) {
  const resolvedSeasonId = useSeasonIdOrCurrent(seasonId);
  const tiersResult = useQuery(
    api.functions.tiers.getTiers,
    resolvedSeasonId
      ? { options: { filter: { seasonId: resolvedSeasonId } } }
      : "skip",
  );

  if (tiersResult === undefined) return <TierTableSkeleton />;

  const tiers: TierDoc[] = Array.isArray(tiersResult)
    ? (tiersResult.filter((tier) => tier !== null) as TierDoc[])
    : tiersResult && typeof tiersResult === "object" && "tiers" in tiersResult
      ? (tiersResult as { tiers: TierDoc[] }).tiers
      : tiersResult && typeof tiersResult === "object" && "_id" in tiersResult
        ? [tiersResult as TierDoc]
        : [];

  const tierRows: TierRow[] = tiers.map((tier) => ({
    key: tier._id,
    name: tier.name,
    payouts: tier.payouts,
    points: tier.points,
  }));

  const tierOrder = ["Standard", "Elevated", "Major", "Playoff"];
  const sortedTiers = [...tierRows].sort(
    (a, b) => tierOrder.indexOf(a.name) - tierOrder.indexOf(b.name),
  );
  const playoffTier = sortedTiers.find((tier) => tier.name === "Playoff");
  const tiersWithSilver = [...sortedTiers];
  if (playoffTier && playoffTier?.payouts.length > 75) {
    const silverTier = {
      ...playoffTier,
      key: "silver-tier",
      name: "Silver",
      payouts: playoffTier.payouts.slice(75),
    };
    const playoffIndex = tiersWithSilver.findIndex((t) => t.name === "Playoff");
    tiersWithSilver.splice(playoffIndex + 1, 0, silverTier);
  }

  if (tiersWithSilver.length === 0 || !tiersWithSilver)
    return <TierTableSkeleton />;
  return (
    <>
      <div className="mt-4 text-center font-varela font-bold">
        Payouts Distributions
      </div>
      <Table className="mx-auto w-3/4 text-center font-varela">
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 px-2 py-1 text-center text-xs font-bold">
              Finish
            </TableHead>
            {tiersWithSilver.map((tier) => (
              <TableHead
                className={cn(
                  "h-8 px-2 py-1 text-center text-xs font-bold",
                  tier.name === "Playoff" &&
                    "border-l border-l-gray-500 bg-yellow-50 bg-opacity-50",
                  tier.name === "Silver" && "bg-gray-100 bg-opacity-50",
                )}
                key={`payouts-${tier.key}`}
              >
                {tier.name === "Playoff" ? "Gold" : tier.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array(30)
            .fill(1)
            .map((_obj, i) => (
              <TableRow key={i}>
                <TableCell className="px-2 py-1 text-sm font-bold">
                  {formatRank(i + 1)}
                </TableCell>
                {tiersWithSilver.map((tier) => (
                  <TableCell
                    className={cn(
                      "border-l px-2 py-1 text-center text-xs",
                      tier.name === "Playoff" &&
                        "border-l-gray-500 bg-yellow-50 bg-opacity-50",
                      tier.name === "Silver" && "bg-gray-100 bg-opacity-50",
                    )}
                    key={`payouts-${tier.key}`}
                  >
                    {!tier.payouts[i] || tier.payouts[i] === 0
                      ? "-"
                      : formatMoney(tier.payouts[i] ?? 0)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </>
  );
}

/**
 * PointsTable Component
 *
 * Displays a table of points distributions for each tier.
 */
export function PointsTable({ seasonId }: { seasonId?: Id<"seasons"> }) {
  const resolvedSeasonId = useSeasonIdOrCurrent(seasonId);
  const tiersResult = useQuery(
    api.functions.tiers.getTiers,
    resolvedSeasonId
      ? { options: { filter: { seasonId: resolvedSeasonId } } }
      : "skip",
  );

  if (tiersResult === undefined) return <TierTableSkeleton />;

  const tiers: TierDoc[] = Array.isArray(tiersResult)
    ? (tiersResult.filter((tier) => tier !== null) as TierDoc[])
    : tiersResult && typeof tiersResult === "object" && "tiers" in tiersResult
      ? (tiersResult as { tiers: TierDoc[] }).tiers
      : tiersResult && typeof tiersResult === "object" && "_id" in tiersResult
        ? [tiersResult as TierDoc]
        : [];

  const tierRows: TierRow[] = tiers.map((tier) => ({
    key: tier._id,
    name: tier.name,
    payouts: tier.payouts,
    points: tier.points,
  }));

  const tierOrder = ["Standard", "Elevated", "Major"];
  const sortedTiers = [...tierRows]
    .filter((tier) => tierOrder.includes(tier.name))
    .sort((a, b) => tierOrder.indexOf(a.name) - tierOrder.indexOf(b.name));

  if (sortedTiers.length === 0 || !sortedTiers) return <TierTableSkeleton />;
  return (
    <>
      <div className="mt-4 text-center font-varela font-bold">
        Points Distributions
      </div>
      <Table className="mx-auto w-3/4 text-center font-varela">
        <TableHeader>
          <TableRow>
            <TableHead className="h-8 px-2 py-1 text-center text-xs font-bold">
              Finish
            </TableHead>
            {sortedTiers.map((tier) => (
              <TableHead
                className="h-8 px-2 py-1 text-center text-xs font-bold"
                key={`points-${tier.key}`}
              >
                {tier.name}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array(35)
            .fill(1)
            .map((_obj, i) => (
              <TableRow key={i}>
                <TableCell className="px-2 py-1 text-sm font-bold">
                  {formatRank(i + 1)}
                </TableCell>
                {sortedTiers.map((tier) => (
                  <TableCell
                    className="border-l px-2 py-1 text-center text-xs"
                    key={`points-${tier.key}`}
                  >
                    {formatNumber(tier.points[i] ?? 0)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </>
  );
}

/**
 * TierTableSkeleton Component
 *
 * Displays a skeleton loading state mimicking the payouts/points table layout.
 */
function TierTableSkeleton() {
  const tierCount = 4;
  const rowCount = 35;
  const tierArray = Array.from({ length: tierCount });
  const rowArray = Array.from({ length: rowCount });

  return (
    <div className="flex w-full flex-col items-center">
      <div className="mb-2 mt-4 w-1/3">
        <Skeleton className="h-6 w-full" />
      </div>
      <div className="mx-auto w-3/4">
        <div className="overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-1 text-center font-varela">
            <thead>
              <tr>
                <th>
                  <Skeleton className="mx-auto h-4 w-12" />
                </th>
                {tierArray.map((_, i) => (
                  <th key={i}>
                    <Skeleton className="mx-auto h-4 w-16" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rowArray.map((_, rowIdx) => (
                <tr key={rowIdx}>
                  <td>
                    <Skeleton className="mx-auto h-4 w-10" />
                  </td>
                  {tierArray.map((_, colIdx) => (
                    <td key={colIdx}>
                      <Skeleton className="mx-auto h-4 w-16" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
