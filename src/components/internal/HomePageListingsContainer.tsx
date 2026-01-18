"use client";

import { Skeleton } from "@/components/ui/skeleton";
import type { HomePageListingsContainerProps } from "@/lib/types";

/**
 * Renders a small home-page listings area that can display either standings or leaderboard content.
 *
 * This container is intentionally presentation-focused: it does not fetch data itself.
 * Parents pass `standingsData` / `leaderboardData` along with loading + error state.
 *
 * Render states:
 * - When `loading` is true (or `isStandingsLoading` while viewing standings), renders a skeleton.
 * - When an error is present for the active view, renders an error message.
 * - When data is present, renders a lightweight summary block.
 * - When neither data nor error is present, renders an empty-state message.
 *
 * @param props - `HomePageListingsContainerProps`.
 * @returns A view-specific block (standings/leaderboard) with loading and error handling.
 */
export function HomePageListingsContainer(
  props: HomePageListingsContainerProps,
) {
  const model = useHomePageListingsContainer(props);

  if (model.isLoading) {
    return (
      <div className="w-full">
        <HomePageListingsContainerSkeleton />
      </div>
    );
  }

  if (model.activeView === "standings") {
    if (model.error) {
      return (
        <div className="py-4 text-center text-red-500">
          Error loading standings: {model.error}
        </div>
      );
    }

    if (model.data) {
      return (
        <div className="py-4 text-center">
          <p>Standings data loaded successfully</p>
          <p>Tours: {model.data.tours.length}</p>
        </div>
      );
    }

    return (
      <div className="py-4 text-center text-gray-500">
        No standings data available
      </div>
    );
  }

  if (model.error) {
    return (
      <div className="py-4 text-center text-red-500">
        Error loading leaderboard: {model.error}
      </div>
    );
  }

  if (model.data) {
    return (
      <div className="py-4 text-center">
        <p>Leaderboard data loaded successfully</p>
        <p>Tournament: {model.data.tournament.name}</p>
        <p>Tours: {model.data.tours.length}</p>
      </div>
    );
  }

  return (
    <div className="py-4 text-center text-gray-500">
      No leaderboard data available
    </div>
  );
}

/**
 * Derives render state for `HomePageListingsContainer`.
 *
 * @param props - Incoming props from the parent.
 * @returns Normalized model for the UI (active view, loading, data, and error).
 */
function useHomePageListingsContainer(props: HomePageListingsContainerProps):
  | {
      activeView: "standings";
      isLoading: boolean;
      error: string | null;
      data: { tours: unknown[] } | null;
    }
  | {
      activeView: "leaderboard";
      isLoading: boolean;
      error: string | null;
      data: { tournament: { name: string }; tours: unknown[] } | null;
    } {
  const activeView = props.activeView ?? "standings";
  const isLoading =
    props.loading === true ||
    (activeView === "standings" && props.isStandingsLoading === true);

  if (activeView === "standings") {
    return {
      activeView,
      isLoading,
      error: props.standingsError ?? null,
      data: props.standingsData ?? null,
    } as const;
  }

  return {
    activeView,
    isLoading,
    error: props.leaderboardError ?? null,
    data: props.leaderboardData ?? null,
  } as const;
}

/**
 * Loading UI for `HomePageListingsContainer`.
 */
function HomePageListingsContainerSkeleton() {
  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-6 w-20" />
      </div>

      {Array.from({ length: 3 }).map((_, tourIndex) => (
        <div key={tourIndex} className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="h-6 w-24" />
          </div>

          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, teamIndex) => (
              <div
                key={teamIndex}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-4 w-6" />
                  <Skeleton className="h-4 w-32" />
                </div>
                <div className="flex items-center gap-4">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
