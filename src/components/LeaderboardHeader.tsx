"use client";

/**
 * LeaderboardHeader Component
 *
 * Displays tournament information including logo, name, dates, course details, and tier information.
 * Uses popover components for course and tier details.
 */

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn, formatMoney, formatTournamentDateRange } from "@/lib/utils";
import { EnhancedTournamentDoc } from "convex/types/types";

export function LeaderboardHeader({
  focusTourney,
  tournaments,
  onTournamentChange,
}: {
  focusTourney: EnhancedTournamentDoc;
  tournaments: EnhancedTournamentDoc[];
  onTournamentChange?: (tournamentId: string) => void;
}) {
  return (
    <div
      id={`leaderboard-header-${focusTourney._id}`}
      className="mx-auto w-full max-w-4xl md:w-11/12 lg:w-8/12"
    >
      <div className="mx-auto grid grid-flow-row grid-cols-10 items-center border-b-2 border-gray-800 py-2">
        <div className="col-span-3 row-span-4 max-h-40 place-self-center px-1 py-2 text-center">
          {focusTourney.logoUrl && (
            <img
              src={focusTourney.logoUrl}
              className="mx-auto max-h-32"
              alt={`${focusTourney.name} logo`}
              width={150}
              height={150}
            />
          )}
        </div>

        <div className="col-span-5 row-span-2 place-self-center text-center text-xl font-bold xs:text-2xl sm:text-3xl lg:text-4xl">
          {focusTourney.name}
        </div>

        <div className="col-span-2 row-span-1 place-self-center text-center text-xs xs:text-sm sm:text-base md:text-lg">
          <HeaderDropdown
            activeTourney={focusTourney}
            tournaments={tournaments}
            onSelect={onTournamentChange}
          />
        </div>

        <div className="col-span-2 row-span-1 place-self-center text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {formatTournamentDateRange(
            focusTourney.startDate,
            focusTourney.endDate,
          )}
        </div>

        <div className="col-span-3 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {focusTourney.course?.name}
        </div>

        <div className="col-span-2 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {focusTourney.course?.location}
        </div>

        <div className="col-span-2 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {focusTourney.course?.front &&
          focusTourney.course?.back &&
          focusTourney.course?.par
            ? `${focusTourney.course.front} - ${focusTourney.course.back} - ${focusTourney.course.par}`
            : "-"}
        </div>

        <div className="col-span-7 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {focusTourney.tier &&
            (focusTourney.tier.name.toLowerCase() === "playoff"
              ? `${focusTourney.tier?.name} Tournament - 1st Place: ${formatMoney(focusTourney.tier?.payouts[0] ?? 0)}`
              : `${focusTourney.tier?.name} Tournament - 1st Place: ${focusTourney.tier?.points[0] ?? 0} pts, ${formatMoney(focusTourney.tier?.payouts[0] ?? 0)}`)}
        </div>
      </div>
    </div>
  );
}

type GroupMode = "schedule" | "tier";

function HeaderDropdown({
  activeTourney,
  tournaments,
  onSelect,
}: {
  activeTourney: EnhancedTournamentDoc;
  tournaments: EnhancedTournamentDoc[];
  onSelect?: (tournamentId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<GroupMode>("schedule");

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    tournaments.forEach((tournament) => {
      const year = getTournamentYear(tournament);
      if (Number.isFinite(year)) {
        yearSet.add(year);
      }
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [tournaments]);

  const activeYear = useMemo(() => {
    const focusYear = getTournamentYear(activeTourney);
    if (availableYears.includes(focusYear)) {
      return focusYear;
    }
    return availableYears[0] ?? focusYear;
  }, [activeTourney, availableYears]);

  const [selectedYear, setSelectedYear] = useState<number | null>(activeYear);

  useEffect(() => {
    setSelectedYear(activeYear ?? null);
  }, [activeYear]);

  const tournamentsForYear = useMemo(() => {
    if (!selectedYear) return [...tournaments];
    return tournaments
      .filter((tournament) => getTournamentYear(tournament) === selectedYear)
      .sort((a, b) => a.startDate - b.startDate);
  }, [selectedYear, tournaments]);

  const tierGroups = useMemo(() => {
    const groups = new Map<string, EnhancedTournamentDoc[]>();
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
    onSelect?.(tournamentId);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm hover:bg-gray-50"
      >
        <span className="truncate">Switch Tournament</span>
        <ChevronDown className="h-4 w-4" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-md border border-gray-200 bg-white shadow-lg">
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
                    tournament={tournament}
                    isActive={tournament._id === activeTourney._id}
                    onSelect={handleTournamentSelect}
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
                      tournament={tournament}
                      isActive={tournament._id === activeTourney._id}
                      onSelect={handleTournamentSelect}
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
        </div>
      )}
    </div>
  );
}

function DropdownRow({
  tournament,
  isActive,
  onSelect,
}: {
  tournament: EnhancedTournamentDoc;
  isActive: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      onClick={() => onSelect(tournament._id)}
      className={cn(
        "flex w-full items-center gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50",
        isActive && "bg-blue-50",
      )}
    >
      {tournament.logoUrl && (
        <img
          src={tournament.logoUrl}
          alt={`${tournament.name} logo`}
          className="h-6 w-6 object-contain"
        />
      )}
      <div>
        <div className="font-medium">{tournament.name}</div>
        <div className="text-xs text-gray-500">
          {formatTournamentDateRange(tournament.startDate, tournament.endDate)}
        </div>
      </div>
    </button>
  );
}

function getTournamentYear(tournament: EnhancedTournamentDoc) {
  return (
    tournament.season?.year ?? new Date(tournament.startDate).getFullYear()
  );
}
