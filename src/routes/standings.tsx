import { createFileRoute } from "@tanstack/react-router";
import { StandingsView } from "@/components/pages/StandingsView";

export const Route = createFileRoute("/standings")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      tour: typeof search.tour === "string" ? search.tour : undefined,
      seasonId:
        typeof search.seasonId === "string" ? search.seasonId : undefined,
    };
  },
  component: StandingsRoute,
});

function StandingsRoute() {
  const { tour, seasonId } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <StandingsView
        initialTourId={tour}
        initialSeasonId={seasonId}
        onTourChange={(nextTourId) =>
          navigate({
            search: (prev) => ({ ...prev, tour: nextTourId }),
            replace: true,
          })
        }
        onSeasonChange={(nextSeasonId) =>
          navigate({
            search: (prev) => ({
              ...prev,
              seasonId: nextSeasonId,
              tour: undefined,
            }),
            replace: true,
          })
        }
      />
    </div>
  );
}
