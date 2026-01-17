"use client";

/**
 * HomePageListingsContainer - Main container component for home page listings
 */

import React from "react";
import { Skeleton } from "../ui/skeleton";
import { DEFAULT_VIEW_TYPE } from "./constants";
import type {
  StandingsData,
  LeaderboardData,
  HomePageListingsViewType,
} from "./types";

interface HomePageListingsContainerProps {
  activeView?: HomePageListingsViewType;
  standingsData?: StandingsData;
  leaderboardData?: LeaderboardData;
  isStandingsLoading?: boolean;
  standingsError?: string | null;
  leaderboardError?: string | null;
}

export const HomePageListingsContainer: React.FC<
  HomePageListingsContainerProps
> = ({
  activeView = DEFAULT_VIEW_TYPE,
  standingsData,
  leaderboardData,
  isStandingsLoading = false,
  standingsError = null,
  leaderboardError = null,
}) => {
  if (isStandingsLoading && activeView === "standings") {
    return (
      <div className="w-full">
        <HomePageListSkeleton />
      </div>
    );
  }

  return (
    <>
      {activeView === "standings" && (
        <>
          {standingsError && (
            <div className="py-4 text-center text-red-500">
              Error loading standings: {standingsError}
            </div>
          )}
          {standingsData && (
            <div className="py-4 text-center">
              <p>Standings data loaded successfully</p>
              <p>Tours: {standingsData.tours.length}</p>
            </div>
          )}
          {!standingsData && !standingsError && (
            <div className="py-4 text-center text-gray-500">
              No standings data available
            </div>
          )}
        </>
      )}

      {activeView === "leaderboard" && (
        <>
          {leaderboardError && (
            <div className="py-4 text-center text-red-500">
              Error loading leaderboard: {leaderboardError}
            </div>
          )}
          {leaderboardData && (
            <div className="py-4 text-center">
              <p>Leaderboard data loaded successfully</p>
              <p>Tournament: {leaderboardData.tournament.name}</p>
              <p>Tours: {leaderboardData.tours.length}</p>
            </div>
          )}
          {!leaderboardData && !leaderboardError && (
            <div className="py-4 text-center text-gray-500">
              No leaderboard data available
            </div>
          )}
        </>
      )}
    </>
  );
};

/**
 * Skeleton loader for HomePageList
 * Displays a placeholder UI while loading
 */
function HomePageListSkeleton() {
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
