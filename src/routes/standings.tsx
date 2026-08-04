import { createFileRoute, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { StandingsView } from "@/facilitators";
import type { StandingsSearch } from "@/types";

export const Route = createFileRoute("/standings")({
  validateSearch: (search: Record<string, unknown>): StandingsSearch => {
    return {
      season:
        typeof search.season === "string" && search.season.trim()
          ? search.season
          : undefined,
      tour:
        typeof search.tour === "string" && search.tour.trim()
          ? search.tour
          : undefined,
    };
  },
  component: StandingsRoute,
  head: () => ({
    meta: [
      { title: "Standings | PGC Tour" },
      {
        name: "description",
        content: "View current PGC Cup standings and playoff qualification.",
      },
    ],
  }),
});

function StandingsRoute() {
  const { season, tour } = Route.useSearch();
  const navigate = Route.useNavigate();
  const location = useLocation();

  useEffect(() => {
    const allowedKeys = new Set(["season", "tour"]);
    if (Object.keys(location.search).every((key) => allowedKeys.has(key))) {
      return;
    }
    navigate({ search: { season, tour }, replace: true });
  }, [location.search, navigate, season, tour]);

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <StandingsView
        initialSeasonId={season}
        initialTourId={tour}
        onSeasonChange={(nextSeasonId) =>
          navigate({
            search: { season: nextSeasonId || undefined, tour },
            replace: true,
          })
        }
        onTourChange={(nextTourId) =>
          navigate({
            search: { season, tour: nextTourId || undefined },
            replace: true,
          })
        }
      />
    </div>
  );
}
