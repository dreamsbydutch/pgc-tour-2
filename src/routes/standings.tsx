import { createFileRoute } from "@tanstack/react-router";
import { Id } from "@/convex";
import { StandingsView } from "@/components/standings/StandingsView";

export const Route = createFileRoute("/standings")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      seasonId:
        typeof search.seasonId === "string"
          ? (search.seasonId as Id<"seasons">)
          : undefined,
      tourId:
        typeof search.tourId === "string"
          ? (search.tourId as Id<"tours"> | "playoffs")
          : undefined,
    };
  },
  component: StandingsRoute,
});

function StandingsRoute() {
  const { seasonId, tourId } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <StandingsView
        initialSeasonId={seasonId}
        initialTourId={tourId}
        onSeasonChange={(nextSeasonId: Id<"seasons">) =>
          navigate({
            search: (prev) => ({ ...prev, seasonId: nextSeasonId }),
            replace: true,
          })
        }
        onTourChange={(nextTourId: Id<"tours"> | "playoffs") =>
          navigate({
            search: (prev) => ({ ...prev, tourId: nextTourId }),
            replace: true,
          })
        }
      />
    </div>
  );
}
