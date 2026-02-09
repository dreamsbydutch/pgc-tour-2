"use client";

import { Dropdown } from "@/components/ui";
import { cn, DropdownItem, DropdownSection, formatMoney, formatTournamentDateRange } from "@/lib";
import { EnhancedTournamentDoc } from "convex/types/types";
import { ChevronDown, RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";

/**
 * LeaderboardHeader Component
 *
 * Header block for the leaderboard view.
 * Renders the active tournament's logo/name, date range, course details, and tier summary,
 * plus a tournament switcher.
 *
 * Data sources:
 * - Tournament data is provided by the parent (typically from Convex-enhanced tournament docs).
 * - Tournament selection UI is delegated to `LeaderboardHeaderDropdown`.
 *
 * Render states:
 * - When `loading` is true, renders the internal skeleton to preserve layout.
 * - When loaded, renders tournament logo/name, date range, course info, and tier summary.
 *
 * @param props - `LeaderboardHeaderProps`.
 *
 * @example
 * <LeaderboardHeader
 *   focusTourney={focusTourney}
 *   tournaments={tournaments}
 *   onTournamentChange={(id) => setTournamentId(id)}
 * />
 */
export function LeaderboardHeader(props: {
  tournament: EnhancedTournamentDoc;
  allTournaments: EnhancedTournamentDoc[];
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
            allTournaments={props.allTournaments}
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
          {props.tournament.course?.name ?? "-"}
        </div>

        <div className="col-span-2 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {props.tournament.course?.location ?? "-"}
        </div>

        <div className="col-span-2 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {props.tournament.course?.front &&
          props.tournament.course?.back &&
          props.tournament.course?.par
            ? `${props.tournament.course.front} - ${props.tournament.course.back} - ${props.tournament.course.par}`
            : "-"}
        </div>

        <div className="col-span-7 row-span-1 text-center text-xs xs:text-sm sm:text-base md:text-lg">
          {props.tournament.tier
            ? props.tournament.tier.name.toLowerCase() === "playoff"
              ? `${props.tournament.tier.name} Tournament - 1st Place: ${formatMoney(props.tournament.tier.payouts[0] ?? 0, false)}`
              : `${props.tournament.tier.name} Tournament - 1st Place: ${props.tournament.tier.points[0] ?? 0} pts, ${formatMoney(props.tournament.tier.payouts[0] ?? 0, false)}`
            : ""}
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
 * - Year filtering
 * - Grouping by schedule order or by tier
 *
 * Render states:
 * - When `loading` is true, renders the internal skeleton.
 * - When loaded, renders a tournament switcher with year filtering and grouping controls.
 *
 * @param props - `LeaderboardHeaderDropdownProps`.
 */
function LeaderboardHeaderDropdown(props: {
  tournament: EnhancedTournamentDoc;
  allTournaments: EnhancedTournamentDoc[];
  onTournamentChange: (tournamentId: string) => void;
}) {
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

  const scheduleItems: DropdownItem[] = useMemo(() => {
    return tournamentsForYear.map((tournament) => ({
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
  }, [handleTournamentSelect, props.tournament._id, tournamentsForYear]);

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
      onOpenChange={setIsOpen}
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
            <div className="flex items-center gap-1 text-[11px] font-semibold">
              <span>Year:</span>
              <select
                className="rounded border border-gray-300 bg-white px-2 py-1 text-xs lowercase text-gray-700"
                value={selectedYear?.toString() ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setSelectedYear(Number(value));
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
      }
      items={groupMode === "schedule" ? scheduleItems : undefined}
      sections={groupMode === "tier" ? tierSections : undefined}
      emptyState={
        <div className="px-4 py-3 text-sm text-gray-500">
          {groupMode === "schedule"
            ? `No tournaments for ${selectedYear ?? "the selected year"}.`
            : "No tournaments available for this selection."}
        </div>
      }
    ></Dropdown>
  );
}

/**
 * Handles state and derived lists for `LeaderboardHeaderDropdown`.
 *
 * @param props - Loaded dropdown props.
 * @returns Dropdown state (open, year, grouping) plus derived lists and handlers.
 */
function useLeaderboardHeaderDropdown(props: {
  tournament: EnhancedTournamentDoc;
  allTournaments: EnhancedTournamentDoc[];
  onTournamentChange: (tournamentId: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [groupMode, setGroupMode] = useState<"schedule" | "tier">("schedule");

  const availableYears = useMemo(() => {
    const yearSet = new Set<number>();
    props.allTournaments.forEach((tournament) => {
      const year =
        tournament.season?.year ?? new Date(tournament.startDate).getFullYear();
      if (Number.isFinite(year)) {
        yearSet.add(year);
      }
    });
    return Array.from(yearSet).sort((a, b) => b - a);
  }, [props.allTournaments]);
  const activeYear = useMemo(() => {
    const focusYear =
      props.tournament.season?.year ??
      new Date(props.tournament.startDate).getFullYear();
    if (availableYears.includes(focusYear)) {
      return focusYear;
    }
    return availableYears[0] ?? focusYear;
  }, [props.tournament, availableYears]);

  const [selectedYear, setSelectedYear] = useState<number>(activeYear);

  const tournamentsForYear = useMemo(() => {
    if (!selectedYear) return [...props.allTournaments];
    return props.allTournaments
      .filter((tournament) => tournament.season?.year ?? new Date(tournament.startDate).getFullYear() === selectedYear)
      .sort((a, b) => a.startDate - b.startDate);
  }, [selectedYear, props.allTournaments]);

  const tierGroups = useMemo(() => {
    const groups = new Map<
      string,
      EnhancedTournamentDoc[]
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
    props.onTournamentChange?.(tournamentId);
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
