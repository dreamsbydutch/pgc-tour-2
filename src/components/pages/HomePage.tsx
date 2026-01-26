import { Link } from "@tanstack/react-router";
import { Shield, Star } from "lucide-react";
import { api, useQuery } from "@/convex";
import { useUser } from "@clerk/tanstack-react-start";

import { LeagueSchedule } from "@/ui";
import { TourCardForm } from "@/components/internal/TourCardForm";
import { TourCardOutput } from "@/components/internal/TourCardOutput";
import { useTournamentCountdown } from "@/hooks";
import { TournamentCountdown } from "@/ui";
import { Skeleton } from "@/ui";
import { useRoleAccess } from "@/hooks";
import { formatMoney } from "@/lib";
import type { TournamentCountdownTourney } from "@/lib";

/**
 * Renders the app home page.
 *
 * This page is responsible for:
 * - determining the signed-in user's role via `useRoleAccess()`,
 * - fetching the current season and the first tournament for that season via Convex,
 * - gating the registration UI (tour card output/form) based on season/tournament dates,
 * - showing a countdown for the next tournament and the league schedule,
 * - showing a role badge (admins can click through to the admin dashboard).
 *
 * @returns The home page UI for the `/` route.
 */
export function HomePage() {
  const model = useHomePage();

  const tourney: TournamentCountdownTourney | undefined =
    model.kind === "ready" ? (model.firstTournament ?? undefined) : undefined;

  const { timeLeft } = useTournamentCountdown(tourney);

  if (model.kind === "loading") {
    return <HomePageSkeleton />;
  }

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
        {model.accountAlert}
        <TournamentCountdown tourney={tourney} timeLeft={timeLeft} />
        <LeagueSchedule />
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
      registrationOpen: boolean;
      beforeFirstTournament: boolean;
      firstTournament: TournamentCountdownTourney | null;
      roleBadge: React.ReactNode;
      accountAlert: React.ReactNode;
    } {
  const { role, isLoading } = useRoleAccess();
  const { user: clerkUser } = useUser();

  const memberRaw = useQuery(
    api.functions.members.getMembers,
    clerkUser ? { options: { clerkId: clerkUser.id } } : "skip",
  );

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
          <Link
            to="/admin"
            search={{ view: "seasons" }}
            className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800"
          >
            <Shield className="h-4 w-4" />
            Administrator
          </Link>
        ) : null}
        {normalizedRole === "moderator" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
            <Star className="h-4 w-4" />
            Moderator
          </span>
        ) : null}
      </div>
    ) : null;

  const memberAccountCents =
    memberRaw &&
    typeof memberRaw === "object" &&
    "account" in memberRaw &&
    typeof (memberRaw as { account?: unknown }).account === "number"
      ? (memberRaw as { account: number }).account
      : null;

  const accountAlert =
    typeof memberAccountCents === "number" && memberAccountCents > 0 ? (
      <Link
        to="/account"
        className="block rounded-lg border bg-amber-50 p-4 text-sm"
      >
        <div className="font-medium text-amber-900">
          You have {formatMoney(memberAccountCents)} in your account.
        </div>
        <div className="mt-1 text-amber-900/80">
          Go to Account to request an e-transfer or donate.
        </div>
      </Link>
    ) : null;

  if (isLoading) {
    return { kind: "loading" };
  }

  return {
    kind: "ready",
    registrationOpen,
    beforeFirstTournament,
    firstTournament,
    roleBadge,
    accountAlert,
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
