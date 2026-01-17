import { createFileRoute } from "@tanstack/react-router";
import { SignedIn } from "@clerk/tanstack-react-start";
import { useQuery } from "convex/react";
import { AdminPanel } from "../components/AdminPanel";
import { useRoleAccess } from "../hooks/useRoleAccess";
import { Shield, Star } from "lucide-react";
import { LeagueSchedule } from "@/components/schedule";
import { TourCardForm } from "@/components/TourCardForm";
import { TourCardOutput } from "@/components/TourCardOutput";
import { api } from "../../convex/_generated/api";
import { TournamentCountdown } from "@/components";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const { isAdmin, role, isLoading } = useRoleAccess();
  const currentSeason = useQuery(api.functions.seasons.getCurrentSeason);
  const firstTournamentResult = useQuery(
    api.functions.tournaments.getTournaments,
    currentSeason
      ? {
          options: {
            filter: { seasonId: currentSeason._id },
            sort: { sortBy: "startDate", sortOrder: "asc" },
            pagination: { limit: 1 },
          },
        }
      : "skip",
  );

  const now = Date.now();
  const registrationOpen = currentSeason?.registrationDeadline
    ? now < currentSeason.registrationDeadline
    : true;

  const firstTournament = Array.isArray(firstTournamentResult)
    ? (firstTournamentResult[0] ?? null)
    : null;

  const beforeFirstTournament = firstTournament?.startDate
    ? now < firstTournament.startDate
    : true;

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-4 text-center">
          <h1 className="font-yellowtail text-7xl font-bold">
            Welcome to the PGC Clubhouse
          </h1>
          {!isLoading && role && (
            <div className="flex items-center justify-center gap-2">
              {role === "admin" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
                  <Shield className="h-4 w-4" />
                  Administrator
                </span>
              )}
              {role === "moderator" && (
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
                  <Star className="h-4 w-4" />
                  Moderator
                </span>
              )}
            </div>
          )}
        </div>
        {beforeFirstTournament && <TourCardOutput />}
        {registrationOpen && <TourCardForm />}
        <TournamentCountdown tourney={firstTournament ?? undefined} />
        <LeagueSchedule />

        <SignedIn>{isAdmin && !isLoading && <AdminPanel />}</SignedIn>
      </div>
    </div>
  );
}
