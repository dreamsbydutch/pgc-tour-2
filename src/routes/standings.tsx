import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useUser } from "@clerk/clerk-react";
import { api } from "../../convex/_generated/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import type { Doc } from "../../convex/_generated/dataModel";

export const Route = createFileRoute("/standings")({
  component: Standings,
});

function Standings() {
  const { user } = useUser();

  const currentSeason = useQuery(api.functions.seasons.getCurrentSeason);

  const standings = useQuery(
    api.functions.teams.getSeasonStandings,
    currentSeason ? { seasonId: currentSeason._id } : "skip",
  );

  const isLoading = currentSeason === undefined || standings === undefined;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
        <div className="mx-auto max-w-4xl space-y-8">
          <div className="space-y-4 text-center">
            <Skeleton className="mx-auto h-8 w-48" />
            <Skeleton className="mx-auto h-4 w-64" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!currentSeason) {
    return (
      <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
        <div className="mx-auto max-w-4xl">
          <Card>
            <CardHeader>
              <CardTitle>No Active Season</CardTitle>
              <CardDescription>
                There is currently no active season available.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </div>
    );
  }

  const standingsByTour = new Map<
    string,
    {
      tour: { name: string; _id: string; logoUrl?: string; buyIn?: number };
      cards: Doc<"tourCards">[];
    }
  >();
  (standings as Doc<"tourCards">[] | undefined)?.forEach((tourCard) => {
    const tourId = "season";
    if (!standingsByTour.has(tourId)) {
      standingsByTour.set(tourId, {
        tour: { name: "Season Standings", _id: tourId },
        cards: [],
      });
    }
    const entry = standingsByTour.get(tourId);
    if (!entry) return;
    entry.cards.push(tourCard);
  });

  standingsByTour.forEach((tourData) => {
    tourData.cards.sort(
      (a: Doc<"tourCards">, b: Doc<"tourCards">) => b.points - a.points,
    );
  });

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-4 text-center">
          <h1 className="text-4xl font-bold tracking-tight">
            Season Standings
          </h1>
          <p className="text-xl text-muted-foreground">
            {currentSeason.name} - Current Tour Standings
          </p>
        </div>

        {Array.from(standingsByTour.values()).map(({ tour, cards }) => (
          <Card key={tour._id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                {tour.logoUrl && (
                  <img
                    src={tour.logoUrl}
                    alt={tour.name}
                    className="h-8 w-8 object-contain"
                  />
                )}
                {tour.name}
              </CardTitle>
              <CardDescription>
                {cards.length} participants • Buy-in: $
                {(((tour.buyIn ?? 0) as number) / 100).toFixed(2)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-4 border-b pb-2 text-sm font-medium text-muted-foreground">
                  <div className="col-span-1">Pos</div>
                  <div className="col-span-6">Player</div>
                  <div className="col-span-2">Points</div>
                  <div className="col-span-2">Wins</div>
                  <div className="col-span-1">Balance</div>
                </div>

                {cards.map((card: Doc<"tourCards">, index: number) => (
                  <div
                    key={card._id}
                    className={`grid grid-cols-12 gap-4 rounded px-2 py-2 transition-colors ${
                      card.clerkId === user?.id
                        ? "border border-blue-200 bg-blue-50 font-semibold"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="col-span-1 font-medium">{index + 1}</div>
                    <div className="col-span-6">
                      {card.clerkId === user?.id
                        ? "You"
                        : `Player ${(card.clerkId || "").slice(-4)}`}
                    </div>
                    <div className="col-span-2 font-medium">
                      {card.points.toLocaleString()}
                    </div>
                    <div className="col-span-2">{card.wins || 0}</div>
                    <div className="col-span-1 text-sm">
                      ${(card.earnings / 100).toFixed(0)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}

        {standingsByTour.size === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>No Standings Available</CardTitle>
              <CardDescription>
                No tour cards found for the current season.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
