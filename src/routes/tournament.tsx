import { LeaderboardHeader } from "@/components";
import { LeaderboardView } from "@/components/leaderboardView/main";
import type { LeaderboardVariant } from "@/components/leaderboardView/utils/types";
import { useLeaderboardViewData } from "@/hooks/useLeaderboardViewData";
import { useLeaderboardViewLogic } from "@/hooks/useLeaderboardViewLogic";
import { getTournamentTimeline } from "@/lib/utils";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { EnhancedTournamentDoc } from "../../convex/types/types";
export const Route = createFileRoute("/tournament")({
  component: TournamentRouterComponent,
  validateSearch: (search: Record<string, unknown>) => {
    const variantRaw = search.variant;
    const variant: LeaderboardVariant | null =
      variantRaw === "regular" ||
      variantRaw === "playoff" ||
      variantRaw === "historical"
        ? variantRaw
        : null;

    return {
      tournamentId: (search.tournamentId as string) || "",
      tourId: (search.tourId as string) || "",
      variant,
    };
  },
});

/**
 * Renders the tournament page using the `/tournament` route search params.
 *
 * Ensures React hook call order stays stable by always running leaderboard hooks,
 * even while the tournament list is still loading.
 */
function TournamentRouterComponent() {
  const {
    tournamentId: searchTournamentId,
    tourId: searchTourId,
    variant,
  } = Route.useSearch();
  const navigate = Route.useNavigate();

  const tournaments = useQuery(api.functions.tournaments.getTournaments, {
    options: {
      sort: {
        sortBy: "startDate",
        sortOrder: "asc",
      },
      enhance: {
        includeSeason: true,
        includeTier: true,
        includeCourse: true,
      },
    },
  }) as EnhancedTournamentDoc[] | undefined;

  const selectedTournament =
    tournaments && tournaments.length > 0
      ? findTournamentById(tournaments, searchTournamentId) ||
        selectDefaultTournament(tournaments)
      : null;

  const { model, tours, tierName } = useLeaderboardViewData({
    tournamentId: selectedTournament?._id ?? null,
  });

  const logic = useLeaderboardViewLogic({
    model,
    tours,
    tierName,
    variantOverride: variant,
  });

  if (tournaments === undefined) {
    return (
      <div className="container mx-auto px-1 py-4">
        <div className="text-center">Loading tournaments...</div>
      </div>
    );
  }

  if (!tournaments || tournaments.length === 0) {
    return (
      <div className="container mx-auto px-1 py-4">
        <div className="text-center text-red-600">No tournaments found.</div>
      </div>
    );
  }

  if (!selectedTournament) {
    return (
      <div className="container mx-auto px-1 py-4">
        <div className="text-center text-red-600">
          Unable to determine a tournament to display.
        </div>
      </div>
    );
  }

  const handleTournamentChange = (nextTournamentId: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        tournamentId: nextTournamentId,
        tourId: "",
      }),
    });
  };

  const effectiveTourId =
    (searchTourId && logic.toggleTours.some((t) => t.id === searchTourId)
      ? searchTourId
      : "") || logic.defaultTourId;

  const handleChangeTourId = (nextTourId: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        tourId: nextTourId,
      }),
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <LeaderboardHeader
        focusTourney={selectedTournament}
        tournaments={tournaments}
        onTournamentChange={handleTournamentChange}
      />

      <div className="mt-4">
        <LeaderboardView
          model={
            model.kind === "ready"
              ? { ...model, toggleTours: logic.toggleTours }
              : model
          }
          activeTourId={effectiveTourId}
          onChangeTourId={handleChangeTourId}
          variant={logic.variant}
          isPreTournament={false}
        />
      </div>
    </div>
  );
}

function findTournamentById(tournaments: EnhancedTournamentDoc[], id?: string) {
  if (!id) return null;
  return tournaments.find((tournament) => tournament._id === id) ?? null;
}

function selectDefaultTournament(tournaments: EnhancedTournamentDoc[]) {
  if (tournaments.length === 0) return null;

  const timeline = getTournamentTimeline([...tournaments]);

  if (timeline.current) {
    return timeline.current;
  }

  if (timeline.future.length > 0) {
    return timeline.future[0];
  }

  if (timeline.past.length > 0) {
    return timeline.past[timeline.past.length - 1];
  }

  return tournaments[0] ?? null;
}
