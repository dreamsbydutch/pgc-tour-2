/**
 * PGALeaderboard - Displays PGA golfers leaderboard
 * Adapted for Convex backend integration
 */

import React from "react";
import {
  sortGolfersByPosition,
  formatScore,
  formatPosition,
  formatThru,
} from "../utils/leaderboard-utils";
import type { PGALeaderboardProps } from "../utils/types";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";

/**
 * PGA Leaderboard Component
 * Renders a list of golfers in position order
 */
export const PGALeaderboard: React.FC<PGALeaderboardProps> = ({
  golfers,
  isPreTournament = false,
}) => {
  const sortedGolfers = sortGolfersByPosition(golfers ?? []);

  if (isPreTournament) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>PGA Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            PGA leaderboard will appear here once the tournament begins.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (sortedGolfers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>PGA Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">No golfer data available.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>PGA Leaderboard</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 border-b border-gray-200 pb-2 text-sm font-semibold text-gray-600">
            <div className="col-span-1">POS</div>
            <div className="col-span-4">PLAYER</div>
            <div className="col-span-2 text-center">SCORE</div>
            <div className="col-span-2 text-center">TODAY</div>
            <div className="col-span-2 text-center">THRU</div>
            <div className="col-span-1 text-center">R1</div>
          </div>

          {sortedGolfers.slice(0, 50).map((golfer) => (
            <div
              key={golfer._id}
              className="grid grid-cols-12 gap-2 rounded py-2 text-sm hover:bg-gray-50"
            >
              <div className="col-span-1 font-medium">
                {formatPosition(golfer.position)}
              </div>

              <div className="col-span-4">
                <div className="font-medium">
                  {golfer.playerName || "Unknown Player"}
                </div>
                {golfer.country && (
                  <div className="text-xs text-gray-500">{golfer.country}</div>
                )}
              </div>

              <div className="col-span-2 text-center font-bold">
                {formatScore(golfer.score)}
              </div>

              <div className="col-span-2 text-center">
                {formatScore(golfer.today)}
              </div>

              <div className="col-span-2 text-center">
                {formatThru(golfer.thru)}
              </div>

              <div className="col-span-1 text-center text-xs">
                {golfer.roundOne !== null && golfer.roundOne !== undefined
                  ? golfer.roundOne.toString()
                  : "-"}
              </div>
            </div>
          ))}

          {sortedGolfers.length > 50 && (
            <div className="py-4 text-center text-sm text-gray-500">
              Showing top 50 of {sortedGolfers.length} golfers
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
