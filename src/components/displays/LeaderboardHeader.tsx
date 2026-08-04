"use client";

import { Dropdown } from "@/ui";
import type { DropdownItem, DropdownSection } from "@/types";
import {
  cn,
  formatCompactTournamentDateRange,
  formatMoney,
  formatTournamentDateRange,
} from "@/utils/app";
import type { TournamentHeaderModel } from "@/types";
import { ChevronDown, ChevronRight, RefreshCwIcon } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

const TournamentHeaderDetails = lazy(() => import("./TournamentHeaderDetails"));

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
  tournament: TournamentHeaderModel;
  allTournaments: TournamentHeaderModel[];
  onTournamentChange: (tournamentId: string) => void;
}) {
  const [awardsOpen, setAwardsOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);

  return (
    <>
      <div
        id={`leaderboard-header-${props.tournament._id}`}
        className="mx-auto w-full max-w-4xl md:w-11/12 lg:w-8/12"
      >
        <div className="mx-auto grid grid-flow-row grid-cols-10 items-center gap-y-0.5 border-b-2 border-gray-800 py-1.5">
          <div className="col-span-3 row-span-4 max-h-36 place-self-center px-1 py-1 text-center">
            {props.tournament.logoUrl && (
              <img
                src={props.tournament.logoUrl}
                className="mx-auto max-h-24 sm:max-h-28 md:max-h-32"
                alt={`${props.tournament.name} logo`}
                width={150}
                height={150}
              />
            )}
          </div>

          <h1 className="col-span-5 row-span-2 place-self-center text-center text-xl font-bold xs:text-2xl sm:text-3xl lg:text-4xl">
            {props.tournament.name}
          </h1>

          <div className="col-span-2 row-span-1 place-self-center text-center text-xs xs:text-sm sm:text-base md:text-lg">
            <LeaderboardHeaderDropdown
              tournament={props.tournament}
              allTournaments={props.allTournaments}
              onTournamentChange={props.onTournamentChange}
            />
          </div>

          <div className="col-span-2 row-span-1 place-self-center text-center text-xs xs:text-sm sm:text-base md:text-lg">
            {formatCompactTournamentDateRange(
              props.tournament.startDate,
              props.tournament.endDate,
            )}
          </div>

          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setCourseOpen(true)}
            className="group col-span-7 row-span-1 mx-auto flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0 rounded-sm px-1 py-0.5 text-center text-xs text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xs:text-sm sm:text-base md:text-lg"
            title="View hole-by-hole course scoring"
          >
            <span className="font-medium text-gray-950">
              {props.tournament.course?.name ?? "-"}
            </span>
            {props.tournament.course && (
              <>
                <span className="text-gray-400" aria-hidden="true">
                  ·
                </span>
                <span>{props.tournament.course.location}</span>
                <span className="text-gray-400" aria-hidden="true">
                  ·
                </span>
                <span className="whitespace-nowrap">
                  Par {props.tournament.course.par} (
                  {props.tournament.course.front}–{props.tournament.course.back}
                  )
                </span>
              </>
            )}
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>

          <button
            type="button"
            aria-haspopup="dialog"
            onClick={() => setAwardsOpen(true)}
            className="group col-span-7 row-span-1 mx-auto flex max-w-full flex-wrap items-center justify-center gap-x-1.5 gap-y-0 rounded-sm px-1 py-0.5 text-center text-xs text-gray-700 transition-colors hover:bg-gray-50 hover:text-gray-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xs:text-sm sm:text-base md:text-lg"
            title="View the full points and payout breakdown"
          >
            {props.tournament.tier && (
              <>
                <span className="font-medium text-gray-950">
                  {props.tournament.tier.name} Tournament
                </span>
                <span className="text-gray-400" aria-hidden="true">
                  ·
                </span>
                <span className="whitespace-nowrap">
                  1st place:{" "}
                  {props.tournament.tier.name.toLowerCase() === "playoff"
                    ? formatMoney(props.tournament.tier.payouts[0] ?? 0, false)
                    : `${props.tournament.tier.points[0] ?? 0} pts / ${formatMoney(props.tournament.tier.payouts[0] ?? 0, false)}`}
                </span>
              </>
            )}
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {(awardsOpen || courseOpen) && (
        <Suspense fallback={null}>
          <TournamentHeaderDetails
            awardsOpen={awardsOpen}
            courseOpen={courseOpen}
            onAwardsOpenChange={setAwardsOpen}
            onCourseOpenChange={setCourseOpen}
            tournament={props.tournament}
          />
        </Suspense>
      )}
    </>
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
  tournament: TournamentHeaderModel;
  allTournaments: TournamentHeaderModel[];
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
      triggerLabel="Switch tournament"
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
  tournament: TournamentHeaderModel;
  allTournaments: TournamentHeaderModel[];
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

  useEffect(() => {
    setSelectedYear(activeYear);
  }, [activeYear]);

  const tournamentsForYear = useMemo(() => {
    if (!selectedYear) return [...props.allTournaments];
    return props.allTournaments
      .filter(
        (tournament) =>
          (tournament.season?.year ??
            new Date(tournament.startDate).getFullYear()) === selectedYear,
      )
      .sort((a, b) => a.startDate - b.startDate);
  }, [selectedYear, props.allTournaments]);

  const tierGroups = useMemo(() => {
    const groups = new Map<string, TournamentHeaderModel[]>();
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
