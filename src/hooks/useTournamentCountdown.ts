import { useEffect, useState } from "react";

import type { TimeLeftType, TournamentCountdownTourney } from "@/lib/types";
import { calculateCountdownTimeLeft } from "@/lib/utils";

/**
 * Derives and updates the countdown time left for a given tournament.
 *
 * This hook is intended to keep timers/intervals out of `src/components/ui/*`.
 *
 * @param tourney - Tournament used to determine the countdown start time.
 * @returns The current `timeLeft`, updated every second.
 */
export function useTournamentCountdown(tourney?: TournamentCountdownTourney) {
  const [timeLeft, setTimeLeft] = useState<TimeLeftType>(null);
  const startDate = tourney?.startDate;

  useEffect(() => {
    if (typeof startDate !== "number") {
      setTimeLeft(null);
      return;
    }

    setTimeLeft(calculateCountdownTimeLeft(startDate));
    const timer = setInterval(() => {
      setTimeLeft(calculateCountdownTimeLeft(startDate));
    }, 1000);
    return () => clearInterval(timer);
  }, [startDate]);

  return { timeLeft };
}
