"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, RefreshCwIcon } from "lucide-react";
import { cn, formatTournamentDateRange, getTournamentYear } from "@/lib/utils";
import type {
  LeaderboardHeaderDropdownProps,
  LeaderboardHeaderGroupMode,
} from "@/lib/types";
import { DropdownRow } from "@/ui";
import { Dropdown, DropdownSkeleton } from "@/ui";

/**
 * LeaderboardHeaderDropdown Component
 *
 * Tournament switcher used by `LeaderboardHeader`.
 * Supports:
 * - Year filtering
 * - Grouping by schedule order or by tier
 *
 * Render states:
 * - When `loading` is true, renders the internal skeleton.
 * - When loaded, renders a tournament switcher with year filtering and grouping controls.
 *
 * @param props - `LeaderboardHeaderDropdownProps`.
 */
export function LeaderboardHeaderDropdown(
  props: LeaderboardHeaderDropdownProps,
) {
  if ("loading" in props && props.loading) {
    return <LeaderboardHeaderDropdownSkeleton className={props.className} />;
  }

  return <LeaderboardHeaderDropdownLoaded {...props} />;
}

function LeaderboardHeaderDropdownLoaded(
  props: Exclude<LeaderboardHeaderDropdownProps, { loading: true }>,
) {
  const {
    isOpen,
    setIsOpen,
    groupMode,
    setGroupMode,
    availableYears,
    selectedYear,
    setSelectedYear,
    tournamentsForYear,
    tierGroups,
    handleTournamentSelect,
  } = useLeaderboardHeaderDropdown(props);

  return (
    <Dropdown
      open={isOpen}
      onOpenChange={setIsOpen}
      className={props.className}
      triggerContent={
        <>
          <RefreshCwIcon className="h-4 w-4 sm:h-5 sm:w-5 md:hidden" />
          <span className="hidden truncate md:block">Switch Tournament</span>
          <ChevronDown className="h-4 w-4" />
        </>
      }
      contentClassName="w-72"
    >
      <div className="border-b border-gray-200 px-3 py-2 text-xs uppercase tracking-wide text-gray-500">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] font-semibold">
            <span>Year:</span>
            <select
              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs lowercase text-gray-700"
              value={selectedYear?.toString() ?? ""}
              onChange={(event) => {
                const value = event.target.value;
                setSelectedYear(value ? Number(value) : null);
              }}
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex gap-1 text-[11px]">
            <button
              type="button"
              onClick={() => setGroupMode("schedule")}
              className={cn(
                "rounded border px-2 py-1",
                groupMode === "schedule"
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-300 text-gray-600",
              )}
            >
              Schedule
            </button>
            <button
              type="button"
              onClick={() => setGroupMode("tier")}
              className={cn(
                "rounded border px-2 py-1",
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
      <div className="max-h-72 overflow-y-auto">
        {groupMode === "schedule" ? (
          tournamentsForYear.length > 0 ? (
            tournamentsForYear.map((tournament) => (
              <DropdownRow
                key={tournament._id}
                title={tournament.name}
                subtitle={formatTournamentDateRange(
                  tournament.startDate,
                  tournament.endDate,
                )}
                iconUrl={tournament.logoUrl ?? null}
                isActive={tournament._id === props.activeTourney._id}
                onSelect={() => handleTournamentSelect(tournament._id)}
              />
            ))
          ) : (
            <div className="px-4 py-3 text-sm text-gray-500">
              No tournaments for {selectedYear ?? "the selected year"}.
            </div>
          )
        ) : tierGroups.length > 0 ? (
          tierGroups.map(([tierName, tierTournaments]) => (
            <div key={tierName}>
              <div className="bg-gray-700 px-4 py-1 text-xs font-semibold uppercase tracking-wide text-gray-50">
                {tierName}
              </div>
              {tierTournaments.map((tournament) => (
                <DropdownRow
                  key={tournament._id}
                  title={tournament.name}
                  subtitle={formatTournamentDateRange(
                    tournament.startDate,
                    tournament.endDate,
                  )}
                  iconUrl={tournament.logoUrl ?? null}
                  isActive={tournament._id === props.activeTourney._id}
                  onSelect={() => handleTournamentSelect(tournament._id)}
                />
              ))}
            </div>
          ))
        ) : (
          <div className="px-4 py-3 text-sm text-gray-500">
            No tournaments available for this selection.
          </div>
        )}
      </div>
    </Dropdown>
  );
}

/**
 * Handles state and derived lists for `LeaderboardHeaderDropdown`.
 *
 * @param props - Loaded dropdown props.
 * @returns Dropdown state (open, year, grouping) plus derived lists and handlers.
 */
function useLeaderboardHeaderDropdown(
  props: Exclude<LeaderboardHeaderDropdownProps, { loading: true }>,
) {
  const [isOpen, setIsOpen] = useState(false);
  const [groupMode, setGroupMode] =
    useState<LeaderboardHeaderGroupMode>("schedule");

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    props.tournaments.forEach((tournament) => {
      const year = getTournamentYear(tournament);
      if (Number.isFinite(year)) {
        yearSet.add(year);
      }
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [props.tournaments]);

  const activeYear = useMemo(() => {
    const focusYear = getTournamentYear(props.activeTourney);
    if (availableYears.includes(focusYear)) {
      return focusYear;
    }
    return availableYears[0] ?? focusYear;
  }, [props.activeTourney, availableYears]);

  const [selectedYear, setSelectedYear] = useState<number | null>(
    () => activeYear ?? null,
  );

  useEffect(() => {
    setSelectedYear(activeYear ?? null);
  }, [activeYear]);

  const tournamentsForYear = useMemo(() => {
    if (!selectedYear) return [...props.tournaments];
    return props.tournaments
      .filter((tournament) => getTournamentYear(tournament) === selectedYear)
      .sort((a, b) => a.startDate - b.startDate);
  }, [selectedYear, props.tournaments]);

  const tierGroups = useMemo(() => {
    const groups = new Map<
      string,
      Array<(typeof tournamentsForYear)[number]>
    >();
    tournamentsForYear.forEach((tournament) => {
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
  }, [tournamentsForYear]);

  const handleTournamentSelect = (tournamentId: string) => {
    setIsOpen(false);
    props.onSelect?.(tournamentId);
  };

  return {
    isOpen,
    setIsOpen,
    groupMode,
    setGroupMode,
    availableYears,
    selectedYear,
    setSelectedYear,
    tournamentsForYear,
    tierGroups,
    handleTournamentSelect,
  };
}

/**
 * Loading UI for `LeaderboardHeaderDropdown`.
 */
function LeaderboardHeaderDropdownSkeleton({
  className,
}: Pick<
  Exclude<LeaderboardHeaderDropdownProps, { loading: true }>,
  "className"
>) {
  return (
    <div className={cn("relative", className)}>
      <DropdownSkeleton />
      <div className="mt-2 hidden w-72 rounded-md border border-gray-200 bg-white shadow-lg" />
    </div>
  );
}
