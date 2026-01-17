"use client";

import { useEffect, useState } from "react";

/**
 * TournamentCountdown Component
 *
 * Displays a live countdown timer to a tournament's start date.
 *
 * @param tourney - Tournament details for countdown display
 *   - name: string - Tournament name
 *   - logoUrl: string | null - Tournament logo URL (optional)
 *   - startDate: string - Tournament start date/time (ISO string)
 *
 * Shows a skeleton loader while loading or if no tournament is provided.
 */
export function TournamentCountdown({
  tourney,
}: {
  tourney?: { name: string; logoUrl?: string | undefined; startDate: number };
}) {
  const [timeLeft, setTimeLeft] = useState<TimeLeftType>(null);

  useEffect(() => {
    setTimeLeft(calculateTimeLeft(tourney?.startDate ?? Date.now()));
    const timer = setInterval(() => {
      setTimeLeft(calculateTimeLeft(tourney?.startDate ?? Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, [tourney?.startDate]);

  if (!tourney || timeLeft === null) {
    return <TournamentCountdownSkeleton />;
  }

  return (
    <div className="mx-auto my-4 w-11/12 max-w-xl rounded-2xl bg-gray-100 p-2 shadow-md">
      <div className="text-center">
        <h1 className="px-4 text-2xl font-bold xs:text-3xl md:text-4xl">
          Countdown until {tourney.name}
        </h1>
        <div className="flex w-full items-center justify-center gap-2 pb-3">
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
          <div className="text-2xl font-bold xs:text-3xl md:text-4xl">
            {twoDigits(timeLeft?.days ?? 0)}:{twoDigits(timeLeft?.hours ?? 0)}:
            {twoDigits(timeLeft?.minutes ?? 0)}:
            {twoDigits(timeLeft?.seconds ?? 0)}
            <div className="text-xs md:text-sm">Days : Hrs : Mins : Secs</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Pads a number to two digits with leading zero if needed
 * @param num - Number to pad
 * @returns Two-digit string
 */
const twoDigits = (num: number): string => String(num).padStart(2, "0");

/**
 * Calculates the time left until a given start date
 * @param startDateTime - The target date/time
 * @returns TimeLeftType object or null if time is up
 */
const calculateTimeLeft = (startDateTime: number): TimeLeftType => {
  const difference = startDateTime - +new Date();
  let timeLeft: TimeLeftType;

  if (difference > 0) {
    timeLeft = {
      days: Math.floor(difference / (1000 * 60 * 60 * 24)),
      hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((difference / 1000 / 60) % 60),
      seconds: Math.floor((difference / 1000) % 60),
    };
  } else {
    timeLeft = null;
  }

  return timeLeft;
};

/**
 * Type for the countdown time left
 */
type TimeLeftType = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
} | null;

/**
 * Skeleton loader for TournamentCountdown
 * Displays a placeholder UI while loading
 */
function TournamentCountdownSkeleton() {
  return (
    <div className="mx-auto my-4 w-11/12 max-w-xl rounded-2xl bg-gray-100 p-2 shadow-md">
      <div className="flex flex-col items-center justify-center gap-1 px-3">
        <div className="h-8 w-5/6 max-w-lg animate-pulse rounded-lg bg-slate-200"></div>
        <div className="h-8 w-2/3 max-w-lg animate-pulse rounded-lg bg-slate-200"></div>
      </div>
      <div className="my-3 flex items-center justify-center gap-2">
        <div className="h-16 w-16 animate-pulse rounded-lg bg-slate-200 xs:h-20 xs:w-20 md:h-28 md:w-28"></div>
        <div className="flex flex-col gap-1">
          <div className="flex flex-row gap-1">
            <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200"></div>
            <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200"></div>
            <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200"></div>
            <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200"></div>
          </div>
          <div className="flex flex-row justify-center gap-1">
            <div className="h-3 w-6 animate-pulse rounded-lg bg-slate-200"></div>
            <div className="h-3 w-6 animate-pulse rounded-lg bg-slate-200"></div>
            <div className="h-3 w-6 animate-pulse rounded-lg bg-slate-200"></div>
            <div className="h-3 w-6 animate-pulse rounded-lg bg-slate-200"></div>
          </div>
        </div>
      </div>
    </div>
  );
}
