/**
 * Hook for leaderboard logic and tour toggle management
 * Adapted from the original useLeaderboardLogic hook
 */

import { useMemo } from "react";
import type {
  LeaderboardDataProps,
  LeaderboardLogicState,
} from "../components/leaderboard/utils/types";
import {
  isPlayoffTournament,
  getMaxPlayoffLevel,
  createTourToggles,
  getDefaultToggle,
} from "../components/leaderboard/utils/leaderboard-utils";

interface UseLeaderboardLogicParams {
  variant: "regular" | "playoff";
  props: LeaderboardDataProps | null;
  inputTourId?: string;
}

/**
 * Hook for determining leaderboard logic and tour toggles
 */
export function useLeaderboardLogic({
  variant,
  props,
  inputTourId,
}: UseLeaderboardLogicParams): LeaderboardLogicState {
  const logicState = useMemo(() => {
    if (!props) {
      return {
        toggleTours: [],
        defaultToggle: "pga",
        isPlayoff: false,
        maxPlayoffLevel: 0,
      };
    }

    const { tournament, tours, tourCards, teams } = props;

    const isPlayoff = isPlayoffTournament(tournament);

    const maxPlayoffLevel = getMaxPlayoffLevel(tourCards);

    const toggleTours = createTourToggles(tours, teams, variant);

    const defaultToggle = getDefaultToggle(tours, teams, variant, inputTourId);

    return {
      toggleTours,
      defaultToggle,
      isPlayoff,
      maxPlayoffLevel,
    };
  }, [variant, props, inputTourId]);

  return logicState;
}
