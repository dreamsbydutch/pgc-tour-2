import { createFileRoute } from "@tanstack/react-router";

import { TournamentPage } from "@/facilitators";
import type { TournamentSearch } from "@/types";

export const Route = createFileRoute("/tournament")({
  component: TournamentRoute,
  validateSearch: (search: Record<string, unknown>): TournamentSearch => ({
    tournamentId:
      typeof search.tournamentId === "string" && search.tournamentId.trim()
        ? search.tournamentId
        : undefined,
    tourId:
      typeof search.tourId === "string" && search.tourId.trim()
        ? search.tourId
        : undefined,
    variant:
      search.variant === "regular" || search.variant === "playoff"
        ? search.variant
        : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Tournament Leaderboard | PGC Tour" },
      {
        name: "description",
        content:
          "Follow live PGA and PGC tournament leaderboards, teams, and hole-by-hole scores.",
      },
    ],
  }),
});

function TournamentRoute() {
  const search = Route.useSearch();
  const routeNavigate = Route.useNavigate();
  return (
    <TournamentPage
      search={search}
      navigate={(nextSearch, options) =>
        routeNavigate({ search: nextSearch, replace: options?.replace })
      }
    />
  );
}
