import { createFileRoute } from "@tanstack/react-router";
import type { LeaderboardVariant } from "@/lib/types";

import { TournamentPage } from "@/facilitators";

export const Route = createFileRoute("/tournament")({
  component: TournamentRoute,
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
 * Route wrapper for `/tournament`.
 */
function TournamentRoute() {
  const { tournamentId, tourId, variant } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <TournamentPage
      searchTournamentId={tournamentId}
      searchTourId={tourId}
      variant={variant}
      onTournamentChange={(nextTournamentId) => {
        navigate({
          search: (prev) => ({
            ...prev,
            tournamentId: nextTournamentId,
            tourId: "",
          }),
        });
      }}
      onChangeTourId={(nextTourId) => {
        navigate({
          search: (prev) => ({
            ...prev,
            tourId: nextTourId,
          }),
        });
      }}
    />
  );
}
