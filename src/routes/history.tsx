import { LeaderboardHeader } from "@/components";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { EnhancedTournamentDoc } from "../../convex/types/types";

export const Route = createFileRoute("/history" as never)({
  component: RouteComponent,
});

function RouteComponent() {
  const tournaments = useQuery(api.functions.tournaments.getTournaments, {}) as
    | EnhancedTournamentDoc[]
    | undefined;

  if (tournaments === undefined) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-6 text-center text-3xl font-bold">
          Tournament History
        </h1>
        <div className="text-center">Loading tournaments...</div>
      </div>
    );
  }

  if (!tournaments || tournaments.length === 0) {
    return (
      <div className="container mx-auto px-4 py-8">
        <h1 className="mb-6 text-center text-3xl font-bold">
          Tournament History
        </h1>
        <div className="text-center">No tournaments found.</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-center text-3xl font-bold">
        Tournament History
      </h1>
      <LeaderboardHeader
        focusTourney={tournaments[0]}
        tournaments={tournaments}
      />
      <div className="mt-8 text-center text-gray-600">
        <p>Showing real tournament data from the Convex database.</p>
        <p>
          Tournament: <strong>{tournaments[0].name}</strong> | Course:{" "}
          <strong>{tournaments[0].course?.name}</strong> | Tier:{" "}
          <strong>{tournaments[0].tier?.name}</strong>
        </p>
        <p className="mt-2 text-sm">
          Total tournaments in database: {tournaments.length}
        </p>
      </div>
    </div>
  );
}
