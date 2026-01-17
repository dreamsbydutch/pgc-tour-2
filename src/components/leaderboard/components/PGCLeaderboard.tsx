/**
 * PGCLeaderboard - Displays PGC teams leaderboard
 * Adapted for Convex backend integration
 */

import React from "react";
import {
  filterTeamsByTour,
  sortTeamsByScore,
  formatScore,
  formatPosition,
} from "../utils/leaderboard-utils";
import type { PGCLeaderboardProps } from "../utils/types";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";

/**
 * PGC Leaderboard Component
 * Renders a list of PGC teams filtered by the active tour and variant
 */
export const PGCLeaderboard: React.FC<PGCLeaderboardProps> = ({
  teams,
  golfers,
  member,
  activeTour,
  variant,
  isPreTournament = false,
}) => {
  const filteredTeams = filterTeamsByTour(teams ?? [], activeTour, variant);
  const sortedTeams = sortTeamsByScore(filteredTeams);

  if (isPreTournament) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team Preview</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            Teams will appear here once the tournament begins.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (sortedTeams.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Teams Found</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No teams found for the selected tour.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {activeTour === "pga"
            ? "PGA Leaderboard"
            : `${activeTour.toUpperCase()} Teams`}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedTeams.map((team, index) => {
            const isCurrentUserTeam =
              team.tourCard?.clerkId === member?.clerkId;

            return (
              <div
                key={team._id}
                className={`rounded-lg border p-4 ${
                  isCurrentUserTeam
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 bg-white"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="text-2xl font-bold text-gray-500">
                      {formatPosition(team.position || index + 1)}
                    </div>
                    <div>
                      <h3 className="font-semibold">
                        {team.tourCard?.displayName ||
                          `Team ${team._id.slice(-6)}`}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {team.golferIds?.length || 0} golfers
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-xl font-bold">
                      {formatScore(team.score)}
                    </div>
                    {team.today !== null && team.today !== undefined && (
                      <div className="text-sm text-gray-500">
                        Today: {formatScore(team.today)}
                      </div>
                    )}
                  </div>
                </div>

                {team.golferIds && team.golferIds.length > 0 && (
                  <div className="mt-3 border-t border-gray-100 pt-3">
                    <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                      {team.golferIds.slice(0, 6).map((golferId, idx) => {
                        const golfer = golfers.find(
                          (g) => g._id.toString() === golferId.toString(),
                        );
                        if (!golfer) return null;

                        return (
                          <div
                            key={golferId.toString()}
                            className="flex justify-between"
                          >
                            <span className="text-gray-700">
                              {golfer.playerName || `Golfer ${idx + 1}`}
                            </span>
                            <span className="font-medium">
                              {formatScore(golfer.score)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
