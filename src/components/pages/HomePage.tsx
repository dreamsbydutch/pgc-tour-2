import { SignedIn } from "@clerk/tanstack-react-start";
import { Shield, Star } from "lucide-react";
import { useQuery } from "convex/react";

import { api } from "convex/_generated/api";

import { AdminPanel } from "@/components/internal/AdminPanel";
import { LeagueSchedule } from "@/components/internal/LeagueSchedule";
import { TourCardForm } from "@/components/internal/TourCardForm";
import { TourCardOutput } from "@/components/internal/TourCardOutput";
import { TournamentCountdown } from "@/components/internal/TournamentCountdown";
import { Skeleton } from "@/components/ui/skeleton";
import { useRoleAccess } from "@/hooks/useRoleAccess";
import type { TournamentCountdownTourney } from "@/lib/types";

/**
 * Renders the app home page.
 *
 * This page is responsible for:
 * - determining the signed-in user's role via `useRoleAccess()`,
 * - fetching the current season and the first tournament for that season via Convex,
 * - gating the registration UI (tour card output/form) based on season/tournament dates,
 * - showing a countdown for the next tournament and the league schedule,
 * - optionally rendering the admin panel for admins.
 *
 * @returns The home page UI for the `/` route.
 */
export function HomePage() {
  const model = useHomePage();

  if (model.kind === "loading") {
    return <HomePageSkeleton />;
  }

  const tourney: TournamentCountdownTourney | undefined =
    model.firstTournament ?? undefined;

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-4 text-center">
          <h1 className="font-yellowtail text-7xl font-bold">
            Welcome to the PGC Clubhouse
          </h1>
          {model.roleBadge}
        </div>

        {model.beforeFirstTournament ? <TourCardOutput /> : null}
        {model.registrationOpen ? <TourCardForm /> : null}
        <TournamentCountdown tourney={tourney} />
        <LeagueSchedule />

        <SignedIn>{model.isAdmin ? <AdminPanel /> : null}</SignedIn>
      </div>
    </div>
  );
}

/**
 * Fetches and derives all home page view state.
 *
 * Sources:
 * - `useRoleAccess()` for role/admin status
 * - `api.functions.seasons.getCurrentSeason` for the current season
 * - `api.functions.tournaments.getTournaments` (limited to 1) for the first tournament
 *
 * Returns booleans that drive conditional rendering (registration state, pre-tournament state)
 * plus a prebuilt role badge element.
 */
function useHomePage():
  | {
      kind: "loading";
    }
  | {
      kind: "ready";
      isAdmin: boolean;
      registrationOpen: boolean;
      beforeFirstTournament: boolean;
      firstTournament: TournamentCountdownTourney | null;
      roleBadge: React.ReactNode;
    } {
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

  const firstTournamentRaw = Array.isArray(firstTournamentResult)
    ? (firstTournamentResult[0] ?? null)
    : null;

  const firstTournament: TournamentCountdownTourney | null = (() => {
    if (!firstTournamentRaw || typeof firstTournamentRaw !== "object") {
      return null;
    }
    const record = firstTournamentRaw as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name : null;
    const startDate =
      typeof record.startDate === "number" ? record.startDate : null;
    const logoUrl =
      typeof record.logoUrl === "string" || record.logoUrl === null
        ? (record.logoUrl as string | null)
        : undefined;
    if (!name || startDate === null) return null;
    return { name, startDate, ...(logoUrl !== undefined ? { logoUrl } : {}) };
  })();

  const beforeFirstTournament = firstTournament?.startDate
    ? now < firstTournament.startDate
    : true;

  const normalizedRole = typeof role === "string" ? role.trim() : "";

  const roleBadge =
    !isLoading && normalizedRole ? (
      <div className="flex items-center justify-center gap-2">
        {normalizedRole === "admin" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
            <Shield className="h-4 w-4" />
            Administrator
          </span>
        ) : null}
        {normalizedRole === "moderator" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
            <Star className="h-4 w-4" />
            Moderator
          </span>
        ) : null}
      </div>
    ) : null;

  if (isLoading) {
    return { kind: "loading" };
  }

  return {
    kind: "ready",
    isAdmin,
    registrationOpen,
    beforeFirstTournament,
    firstTournament,
    roleBadge,
  };
}

/**
 * Skeleton UI for the home page while role/season data is loading.
 */
function HomePageSkeleton() {
  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
