"use client";

import { api, Id, useQuery } from "@/convex";
import type { Doc } from "@/convex";
import { Dropdown, Skeleton } from "@/components/ui";
import { useUser } from "@clerk/tanstack-react-start";
import {
  cn,
  DropdownItem,
  DropdownSection,
  formatMoney,
  formatTournamentDateRange,
} from "@/lib";
import { ChevronDown, RefreshCwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { type TournamentFetchResult } from "convex/types/tournaments";

/**
 * LeaderboardHeader Component
 *
 * Header block for the leaderboard view.
 * Renders the active tournament's logo/name, date range, course details, and tier summary,
 * plus a tournament switcher.
 *
 * Data sources:
 * - Tournament data is provided by the parent (typically from Convex-enhanced tournament docs).
 * - Tournament selection data is fetched lazily by `LeaderboardHeaderDropdown` after the switcher is opened.
 *
 * Render states:
 * - When `loading` is true, renders the internal skeleton to preserve layout.
 * - When loaded, renders tournament logo/name, date range, course info, and tier summary.
 *
 * @param props - `LeaderboardHeaderProps`.
 *
 * @example
 * <LeaderboardHeader
 *   tournament={focusTourney}
 *   onTournamentChange={(id) => setTournamentId(id)}
 * />
 */
export function LeaderboardHeader(props: {
  tournament: TournamentFetchResult;
  onTournamentChange: (tournamentId: string) => void;
}) {
  return (
    <div
      id={`leaderboard-header-${props.tournament._id}`}
      className="mx-auto w-full max-w-4xl md:w-11/12 lg:w-8/12"
    >
      <div className="mx-auto grid grid-flow-row grid-cols-10 items-center border-b-2 border-gray-800 py-2">
        <div className="col-span-3 row-span-4 max-h-40 place-self-center px-1 py-2 text-center">
          {props.tournament.logoUrl && (
            <img
              src={props.tournament.logoUrl}
              className="mx-auto max-h-32"
              alt={`${props.tournament.name} logo`}
              width={150}
              height={150}
            />
          )}
        </div>

        <div className="col-span-5 row-span-2 place-self-center text-center text-xl font-bold xs:text-2xl sm:text-3xl lg:text-4xl">
          {props.tournament.name}
        </div>

        <div className="col-span-2 row-span-1 place-self-center text-center text-xs xs:text-sm sm:text-base md:text-lg">
          <LeaderboardHeaderDropdown
            tournament={props.tournament}
            onTournamentChange={props.onTournamentChange}
          />
        </div>

        <div className="col-span-2 row-span-1 place-self-center text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {formatTournamentDateRange(
            props.tournament.startDate,
            props.tournament.endDate,
          )}
        </div>

        <div className="col-span-3 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {props.tournament.course.name}
        </div>

        <div className="col-span-2 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {props.tournament.course.location}
        </div>

        <div className="col-span-2 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {`${props.tournament.course.front} - ${props.tournament.course.back} - ${props.tournament.course.par}`}
        </div>

        <div className="col-span-7 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {props.tournament.tier.name.toLowerCase() === "playoff"
            ? `${props.tournament.tier.name} Tournament - 1st Place: ${formatMoney(props.tournament.tier.payouts[0] ?? 0, false)}`
            : `${props.tournament.tier.name} Tournament - 1st Place: ${props.tournament.tier.points[0] ?? 0} pts, ${formatMoney(props.tournament.tier.payouts[0] ?? 0, false)}`}
        </div>
      </div>
    </div>
  );
}

/**
 * LeaderboardHeaderDropdown Component
 *
 * Tournament switcher used by `LeaderboardHeader`.
 * Supports:
 * - Season filtering
 * - Grouping by schedule order or by tier
 *
 * Render states:
 * - Closed: does not fetch season or tournament options.
 * - Open/loading: fetches seasons plus tournaments for the selected season.
 * - Open/loaded: renders a tournament switcher with season filtering and grouping controls.
 *
 * @param props - `LeaderboardHeaderDropdownProps`.
 */
function LeaderboardHeaderDropdown(props: {
  tournament: TournamentFetchResult;
  onTournamentChange: (tournamentId: string) => void;
}) {
  const {
    isLoading,
    isOpen,
    handleOpenChange,
    groupMode,
    setGroupMode,
    canSelectSeason,
    availableSeasons,
    selectedSeasonId,
    setSelectedSeasonId,
    selectedSeasonLabel,
    tournamentsForSeason,
    tierGroups,
    handleTournamentSelect,
  } = useLeaderboardHeaderDropdown(props);

  const scheduleItems: DropdownItem[] = useMemo(() => {
    return tournamentsForSeason.map((tournament) => ({
      key: tournament._id,
      title: tournament.name,
      subtitle: formatTournamentDateRange(
        tournament.startDate,
        tournament.endDate,
      ),
      iconUrl: tournament.logoUrl ?? null,
      isActive: tournament._id === props.tournament._id,
      onSelect: () => handleTournamentSelect(tournament._id),
    }));
  }, [handleTournamentSelect, props.tournament._id, tournamentsForSeason]);

  const tierSections: DropdownSection[] = useMemo(() => {
    return tierGroups.map(([tierName, tierTournaments]) => ({
      key: tierName,
      title: tierName,
      items: tierTournaments.map((tournament) => ({
        key: tournament._id,
        title: tournament.name,
        subtitle: formatTournamentDateRange(
          tournament.startDate,
          tournament.endDate,
        ),
        iconUrl: tournament.logoUrl ?? null,
        isActive: tournament._id === props.tournament._id,
        onSelect: () => handleTournamentSelect(tournament._id),
      })),
    }));
  }, [handleTournamentSelect, props.tournament._id, tierGroups]);

  return (
    <Dropdown
      open={isOpen}
      onOpenChange={handleOpenChange}
      triggerContent={
        <>
          <RefreshCwIcon className="h-4 w-4 sm:h-5 sm:w-5 md:hidden" />
          <span className="hidden truncate md:block">Switch Tournament</span>
          <ChevronDown className="h-4 w-4" />
        </>
      }
      contentClassName="w-72"
      header={
        <div className="border-b border-gray-200 px-3 py-2 text-xs uppercase tracking-wide text-gray-500">
          <div className="flex flex-wrap items-center gap-2">
            {canSelectSeason ? (
              <div className="flex items-center gap-1 text-[11px] font-semibold">
                <span>Season:</span>
                {availableSeasons.length > 0 ? (
                  <select
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs lowercase text-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
                    value={selectedSeasonId ?? ""}
                    disabled={isLoading}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedSeasonId(value as Id<"seasons">);
                    }}
                  >
                    {availableSeasons.map((season) => (
                      <option key={season._id} value={season._id}>
                        {formatSeasonLabel(season)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Skeleton className="h-7 w-20 rounded" />
                )}
              </div>
            ) : (
              <div className="text-[11px] font-semibold text-gray-400">
                Current Season
              </div>
            )}
            <div className="ml-auto flex gap-1 text-[11px]">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setGroupMode("schedule")}
                className={cn(
                  "rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-60",
                  groupMode === "schedule"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-600",
                )}
              >
                Schedule
              </button>
              <button
                type="button"
                disabled={isLoading}
                onClick={() => setGroupMode("tier")}
                className={cn(
                  "rounded border px-2 py-1 disabled:cursor-not-allowed disabled:opacity-60",
                  groupMode === "tier"
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-600",
                )}
              >
                By Tier
              </button>
            </div>
          </div>
        </div>
      }
      items={
        !isLoading &&
        tournamentsForSeason.length > 0 &&
        groupMode === "schedule"
          ? scheduleItems
          : undefined
      }
      sections={
        !isLoading && tournamentsForSeason.length > 0 && groupMode === "tier"
          ? tierSections
          : undefined
      }
    >
      {isLoading ? (
        <LeaderboardHeaderDropdownSkeleton />
      ) : (
        <div className="px-4 py-3 text-sm text-gray-500">
          {`No tournaments for ${selectedSeasonLabel}.`}
        </div>
      )}
    </Dropdown>
  );
}

/** Renders the dropdown placeholder rows while tournament options are loading. */
function LeaderboardHeaderDropdownSkeleton() {
  return (
    <div className="px-3 py-2">
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <div className="space-y-1">
          {[0, 1, 2, 3].map((index) => (
            <div
              key={index}
              className="flex items-center gap-3 rounded-md px-1 py-2"
            >
              <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Handles lazy dropdown fetching and derived lists for `LeaderboardHeaderDropdown`.
 *
 * @param props - Loaded dropdown props.
 * @returns Dropdown state (open, season, grouping) plus derived lists and handlers.
 */
function useLeaderboardHeaderDropdown(props: {
  tournament: TournamentFetchResult;
  onTournamentChange: (tournamentId: string) => void;
}) {
  const { user, isLoaded: isAuthLoaded } = useUser();
  const [hasRequestedOptions, setHasRequestedOptions] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<"schedule" | "tier">("schedule");
  const [selectedSeasonId, setSelectedSeasonId] =
    useState<Id<"seasons"> | null>(props.tournament.seasonId);
  const canSelectSeason = Boolean(user);

  const seasons = useQuery(
    api.functions.seasons.getSeasons,
    hasRequestedOptions && canSelectSeason
      ? {
          options: {
            sort: {
              sortBy: "year",
              sortOrder: "desc",
            },
          },
        }
      : "skip",
  );

  const tournamentsForSeasonQuery = useQuery(
    api.functions.tournaments.getTournaments,
    hasRequestedOptions && selectedSeasonId
      ? {
          options: {
            filter: {
              seasonId: selectedSeasonId,
            },
            sort: {
              sortBy: "startDate",
              sortOrder: "asc",
            },
            enhance: {
              includeTier: true,
            },
          },
        }
      : "skip",
  );

  useEffect(() => {
    setSelectedSeasonId(props.tournament.seasonId);
  }, [props.tournament._id, props.tournament.seasonId]);

  useEffect(() => {
    if (!seasons || seasons.length === 0) return;
    if (
      selectedSeasonId &&
      seasons.some((season) => season._id === selectedSeasonId)
    ) {
      return;
    }
    setSelectedSeasonId(seasons[0]?._id ?? null);
  }, [seasons, selectedSeasonId]);

  const availableSeasons = useMemo(() => seasons ?? [], [seasons]);
  const selectedSeason = useMemo(() => {
    return availableSeasons.find((season) => season._id === selectedSeasonId);
  }, [availableSeasons, selectedSeasonId]);
  const selectedSeasonLabel = useMemo(() => {
    if (!canSelectSeason) return "the current season";
    return formatSeasonLabel(selectedSeason);
  }, [canSelectSeason, selectedSeason]);
  const tournamentsForSeason = useMemo<TournamentFetchResult[]>(() => {
    return (
      (tournamentsForSeasonQuery as TournamentFetchResult[] | undefined) ?? []
    );
  }, [tournamentsForSeasonQuery]);
  const isLoading =
    hasRequestedOptions &&
    (!isAuthLoaded ||
      (canSelectSeason && seasons === undefined) ||
      (selectedSeasonId !== null && tournamentsForSeasonQuery === undefined));

  const tierGroups = useMemo(() => {
    const groups = new Map<string, TournamentFetchResult[]>();
    tournamentsForSeason.forEach((tournament) => {
      const tierName = tournament.tier?.name ?? "Uncategorized";
      const list = groups.get(tierName) ?? [];
      list.push(tournament);
      groups.set(tierName, list);
    });
    return Array.from(groups.entries()).sort(([, tournsA], [, tournsB]) => {
      const payoutA = tournsA[0]?.tier?.payouts[0] ?? 0;
      const payoutB = tournsB[0]?.tier?.payouts[0] ?? 0;
      return payoutA - payoutB;
    });
  }, [tournamentsForSeason]);

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setHasRequestedOptions(true);
    }
    setIsOpen(open);
  };

  const handleTournamentSelect = (tournamentId: string) => {
    setIsOpen(false);
    props.onTournamentChange?.(tournamentId);
  };

  return {
    isLoading,
    isOpen,
    handleOpenChange,
    groupMode,
    setGroupMode,
    canSelectSeason,
    availableSeasons,
    selectedSeasonId,
    setSelectedSeasonId,
    selectedSeasonLabel,
    tournamentsForSeason,
    tierGroups,
    handleTournamentSelect,
  };
}

/** Returns the display label for the selected season in the dropdown popup. */
function formatSeasonLabel(season?: Doc<"seasons"> | null): string {
  if (!season) return "the selected season";
  return season.year.toString();
}
