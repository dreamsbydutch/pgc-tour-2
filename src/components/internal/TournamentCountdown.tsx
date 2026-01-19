"use client";

import type {
  TimeLeftType,
  TournamentCountdownProps,
  TournamentCountdownTourney,
} from "@/lib/types";
import { calculateCountdownTimeLeft, formatTwoDigits } from "@/lib/utils";
import { Skeleton } from "@/ui";
import { useEffect, useState } from "react";

/**
 * TournamentCountdown
 *
 * Displays a live countdown to a tournament's `startDate` and optionally shows the tournament
 * logo alongside a `DD:HH:MM:SS` timer.
 *
 * Data sources:
 * - None. The tournament value is provided by the parent (typically from a query/hook).
 *
 * Major render states:
 * - No `tourney` or timer not initialized yet: renders `TournamentCountdownSkeleton`.
 * - Otherwise: renders the countdown card.
 *
 * @param props - Component props.
 * @param props.tourney - Tournament details used for display and timing.
 * @returns A countdown card or a skeleton state.
 *
 * @example
 * <TournamentCountdown tourney={tournament} />
 */
export function TournamentCountdown({ tourney }: TournamentCountdownProps) {
  const { timeLeft } = useTournamentCountdown({ tourney });

  if (!tourney || timeLeft === null) {
    return <TournamentCountdownSkeleton />;
  }

  return (
    <div className="mx-auto my-4 w-11/12 max-w-xl rounded-2xl bg-gray-100 px-2 py-4 shadow-md">
      <div className="flex flex-col items-center justify-center gap-2 text-center font-varela font-bold">
        <h1 className="px-4 text-2xl xs:text-3xl md:text-4xl">
          Countdown until {tourney.name}
        </h1>
        <div className="flex w-full items-center justify-center gap-2">
          <div>
            {tourney.logoUrl && (
              <img
                className="h-16 w-full xs:h-20 md:h-28"
                alt="Tourney Logo"
                src={tourney.logoUrl}
                width={80}
                height={80}
              />
            )}
          </div>
          <div className="text-2xl xs:text-3xl md:text-4xl">
            {formatTwoDigits(timeLeft?.days ?? 0)}:
            {formatTwoDigits(timeLeft?.hours ?? 0)}:
            {formatTwoDigits(timeLeft?.minutes ?? 0)}:
            {formatTwoDigits(timeLeft?.seconds ?? 0)}
            <div className="text-xs md:text-sm">Days : Hrs : Mins : Secs</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * useTournamentCountdown
 *
 * Derives and updates the countdown time left for the provided tournament.
 *
 * @param input - Hook inputs.
 * @param input.tourney - Tournament used to determine the countdown start time.
 * @returns An object containing `timeLeft`, updated every second.
 */
function useTournamentCountdown({
  tourney,
}: {
  tourney?: TournamentCountdownTourney;
}) {
  const [timeLeft, setTimeLeft] = useState<TimeLeftType>(null);

  useEffect(() => {
    setTimeLeft(calculateCountdownTimeLeft(tourney?.startDate ?? Date.now()));
    const timer = setInterval(() => {
      setTimeLeft(calculateCountdownTimeLeft(tourney?.startDate ?? Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, [tourney?.startDate]);

  return { timeLeft };
}

/**
 * Loading UI for `TournamentCountdown`.
 */
function TournamentCountdownSkeleton() {
  return (
    <div className="mx-auto my-4 w-11/12 max-w-xl rounded-2xl bg-gray-100 p-2 shadow-md">
      <div className="flex flex-col items-center justify-center gap-1 px-3">
        <Skeleton className="h-8 w-5/6 max-w-lg" />
        <Skeleton className="h-8 w-2/3 max-w-lg" />
      </div>
      <div className="my-3 flex items-center justify-center gap-2">
        <Skeleton className="h-16 w-16 rounded-lg xs:h-20 xs:w-20 md:h-28 md:w-28" />
        <div className="flex flex-col gap-1">
          <div className="flex flex-row gap-1">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
          <div className="flex flex-row justify-center gap-1">
            <Skeleton className="h-3 w-6 rounded-lg" />
            <Skeleton className="h-3 w-6 rounded-lg" />
            <Skeleton className="h-3 w-6 rounded-lg" />
            <Skeleton className="h-3 w-6 rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
