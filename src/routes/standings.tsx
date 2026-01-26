import { createFileRoute } from "@tanstack/react-router";
import { StandingsView } from "@/facilitators";

export const Route = createFileRoute("/standings")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      season: typeof search.season === "string" ? search.season : undefined,
      tour: typeof search.tour === "string" ? search.tour : undefined,
    };
  },
  component: StandingsRoute,
});

function StandingsRoute() {
  const { season, tour } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <StandingsView
        initialSeasonId={season}
        initialTourId={tour}
        onSeasonChange={(nextSeasonId) =>
          navigate({
            search: (prev) => ({ ...prev, season: nextSeasonId }),
            replace: true,
          })
        }
        onTourChange={(nextTourId) =>
          navigate({
            search: (prev) => ({ ...prev, tour: nextTourId }),
            replace: true,
          })
        }
      />
    </div>
  );
}
