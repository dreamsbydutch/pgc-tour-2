import { api, useQuery } from "@/convex";

import { LeaderboardHeader } from "@/components";
import type { EnhancedTournamentDoc } from "convex/types/types";

/**
 * Renders the tournament history page.
 *
 * This page fetches tournaments from Convex and renders the existing
 * `LeaderboardHeader` in "history" mode for quickly navigating tournament data.
 *
 * @returns The history page UI for the `/history` route.
 */
export function HistoryPage() {
  const model = useHistoryPage();

  if (model.kind === "loading") {
    return <HistoryPageSkeleton />;
  }

  if (model.kind === "empty") {
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
        focusTourney={model.tournaments[0]}
        tournaments={model.tournaments}
      />
      <div className="mt-8 text-center text-gray-600">
        <p>Showing real tournament data from the Convex database.</p>
        <p>
          Tournament: <strong>{model.tournaments[0].name}</strong> | Course:{" "}
          <strong>{model.tournaments[0].course?.name}</strong> | Tier:{" "}
          <strong>{model.tournaments[0].tier?.name}</strong>
        </p>
        <p className="mt-2 text-sm">
          Total tournaments in database: {model.tournaments.length}
        </p>
      </div>
    </div>
  );
}

/**
 * Fetches and normalizes the tournaments list for the history page.
 *
 * Source:
 * - `api.functions.tournaments.getTournaments`
 *
 * Returns a small discriminated union so the UI can render loading/empty/ready.
 */
function useHistoryPage():
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "ready"; tournaments: EnhancedTournamentDoc[] } {
  const tournaments = useQuery(api.functions.tournaments.getTournaments, {}) as
    | EnhancedTournamentDoc[]
    | undefined;

  if (tournaments === undefined) return { kind: "loading" };
  if (!tournaments || tournaments.length === 0) return { kind: "empty" };

  return { kind: "ready", tournaments };
}

/**
 * Skeleton UI for the history page while tournaments are loading.
 */
function HistoryPageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-center text-3xl font-bold">
        Tournament History
      </h1>
      <div className="text-center">Loading tournaments...</div>
    </div>
  );
}
