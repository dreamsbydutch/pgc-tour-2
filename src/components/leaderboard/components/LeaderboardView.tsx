import React, { useState, useEffect } from "react";
import { useLeaderboardData } from "../../../hooks/useLeaderboardData";
import { useLeaderboardLogic } from "../../../hooks/useLeaderboardLogic";
import { PGCLeaderboard } from "./PGCLeaderboard";
import { PGALeaderboard } from "./PGALeaderboard";
import type { LeaderboardViewProps } from "../utils/types";
import { Card, CardContent, CardHeader, CardTitle } from "../../ui/card";
import { Skeleton } from "../../ui/skeleton";
import { Button } from "../../ui/button";

/**
 * Main LeaderboardView component
 * Orchestrates the entire leaderboard display
 */
export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  tournamentId,
  variant = "regular",
  inputTour,
  isPreTournament = false,
  onRefetch,
}) => {
  const { props, loading, error, refetch } = useLeaderboardData({
    tournamentId,
    inputTour,
  });

  const { toggleTours, defaultToggle, isPlayoff } = useLeaderboardLogic({
    variant: variant === "historical" ? "regular" : variant,
    props,
    inputTourId: inputTour,
  });

  const [activeTour, setActiveTour] = useState<string>("");

  useEffect(() => {
    if (toggleTours.length > 0 && defaultToggle) {
      const storedActiveTour =
        typeof window !== "undefined"
          ? localStorage.getItem("activeTour")
          : null;

      const isStoredTourValid =
        storedActiveTour &&
        toggleTours.some((tour) => tour.id === storedActiveTour);

      const tourToSet = isStoredTourValid ? storedActiveTour : defaultToggle;

      if (tourToSet !== activeTour) {
        setActiveTour(tourToSet);
      }
    }
  }, [defaultToggle, toggleTours, activeTour, props?.teams]);

  useEffect(() => {
    if (activeTour && typeof window !== "undefined") {
      localStorage.setItem("activeTour", activeTour);
    }
  }, [activeTour]);

  const handleRefetch = () => {
    refetch();
    onRefetch?.();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-red-600">
            Error Loading Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-red-600">{error.message}</p>
          <Button onClick={handleRefetch} variant="outline">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!props) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Data Available</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            No tournament data available at this time.
          </p>
        </CardContent>
      </Card>
    );
  }

  const renderTourToggles = () => {
    if (toggleTours.length <= 1) return null;

    return (
      <div className="mb-6 flex flex-wrap gap-2">
        {toggleTours.map((tour) => (
          <Button
            key={tour.id}
            onClick={() => setActiveTour(tour.id)}
            variant={activeTour === tour.id ? "default" : "outline"}
            size="sm"
            className="flex items-center space-x-2"
          >
            {tour.logoUrl && (
              <img
                src={tour.logoUrl}
                alt={tour.shortForm}
                className="h-4 w-4 object-contain"
              />
            )}
            <span>{tour.shortForm}</span>
            {tour.teamCount !== undefined && tour.teamCount > 0 && (
              <span className="text-xs opacity-75">({tour.teamCount})</span>
            )}
          </Button>
        ))}
      </div>
    );
  };

  const renderLeaderboard = () => {
    const { tournament, teams, golfers, member, tourCard } = props;

    if (activeTour === "pga") {
      return (
        <PGALeaderboard
          golfers={golfers}
          tournament={tournament}
          isPreTournament={isPreTournament}
        />
      );
    }

    return (
      <PGCLeaderboard
        teams={teams}
        golfers={golfers}
        tournament={tournament}
        tourCard={tourCard}
        member={member}
        activeTour={activeTour}
        variant={variant === "historical" ? "regular" : variant}
        isPreTournament={isPreTournament}
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h2 className="text-2xl font-bold">{props.tournament.name}</h2>
        {isPlayoff && (
          <div className="inline-flex items-center rounded-full bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800">
            Playoff Tournament
          </div>
        )}
      </div>

      {renderTourToggles()}

      {renderLeaderboard()}
    </div>
  );
};
