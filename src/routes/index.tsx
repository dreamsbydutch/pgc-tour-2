import { createFileRoute } from "@tanstack/react-router";
import { Link as RouterLink } from "@tanstack/react-router";

import { Shield, Star } from "lucide-react";
import { formatMoney } from "@/lib";
import { Skeleton } from "@/components/ui";
import { useRoleAccess } from "@/hooks";
import { useQuery } from "convex/react";
import { api } from "@/convex";
import {
  LeagueSchedule,
  TourCardForm,
  TournamentCountdown,
} from "@/components/displays";
import {
  EnhancedTournamentDoc,
  MemberDoc,
  SeasonDoc,
  TourCardDoc,
  TourDoc,
  TournamentDoc,
} from "convex/types/types";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const model = useHomePage();

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

        <TourCardForm {...model} />
        <TournamentCountdown {...model.nextTournament} />
        {model.accountAlert}
        <LeagueSchedule tournaments={model.seasonTournaments} />
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
      currentSeason: SeasonDoc;
      firstTournament: TournamentDoc;
      nextTournament: TournamentDoc;
      seasonTournaments: EnhancedTournamentDoc[];
      member: MemberDoc;
      tours: TourDoc[];
      seasonTourCards: TourCardDoc[];
      roleBadge: React.ReactNode;
      accountAlert: React.ReactNode;
    } {
  const { role, member, isLoading } = useRoleAccess();

  const currentSeason = useQuery(api.functions.seasons.getCurrentSeason);
  const tours =
    useQuery(api.functions.tours.getTours, {
      options: {
        filter: { seasonId: currentSeason?._id },
        sort: { sortBy: "name", sortOrder: "asc" },
      },
    }) || [];
  const seasonTourCards =
    useQuery(api.functions.tourCards.getTourCards, {
      options: { seasonId: currentSeason?._id },
    }) || [];
  const seasonTournaments = useQuery(
    api.functions.tournaments.getTournaments,
    currentSeason
      ? {
          options: {
            filter: { seasonId: currentSeason._id },
            sort: { sortBy: "startDate", sortOrder: "asc" },
          },
        }
      : "skip",
  ) as EnhancedTournamentDoc[] | undefined;

  const now = Date.now();
  const registrationOpen = currentSeason?.registrationDeadline
    ? now < currentSeason.registrationDeadline
    : Boolean(currentSeason);

  const firstTournament: TournamentDoc | null = seasonTournaments?.[0] ?? null;
  const nextTournament: TournamentDoc | null =
    seasonTournaments?.find((t) => t.startDate > now) ?? null;

  const beforeFirstTournament = firstTournament?.startDate
    ? now < firstTournament.startDate
    : false;

  const normalizedRole = typeof role === "string" ? role.trim() : "";

  const roleBadge =
    !isLoading && normalizedRole ? (
      <div className="flex items-center justify-center gap-2">
        {normalizedRole === "admin" ? (
          <RouterLink
            to="/admin"
            search={{ view: "seasons" }}
            className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800"
          >
            <Shield className="h-4 w-4" />
            Administrator
          </RouterLink>
        ) : null}
        {normalizedRole === "moderator" ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
            <Star className="h-4 w-4" />
            Moderator
          </span>
        ) : null}
      </div>
    ) : null;

  const accountAlert =
    typeof member?.account === "number" && member?.account > 0 ? (
      <RouterLink
        to="/account"
        className="block rounded-lg border bg-amber-50 p-4 text-sm"
      >
        <div className="font-medium text-amber-900">
          You have {formatMoney(member.account, true)} in your account.
        </div>
        <div className="mt-1 text-amber-900/80">
          Go to Account to request an e-transfer or donate.
        </div>
      </RouterLink>
    ) : typeof member?.account === "number" && member?.account < 0 ? (
      <div className="block rounded-lg border bg-red-100 p-4 text-sm">
        <div className="font-medium text-amber-900">
          You owe {formatMoney(member?.account, true)} for this season.
        </div>
        <div className="mt-1 text-amber-900/80">
          Send e-transfer to puregolfcollectivetour@gmail.com to unlock your
          account.
        </div>
      </div>
    ) : null;

  if (
    isLoading ||
    currentSeason === undefined ||
    firstTournament === undefined ||
    firstTournament === null ||
    nextTournament === undefined ||
    nextTournament === null
  ) {
    return { kind: "loading" };
  }

  return {
    kind: "ready",
    registrationOpen,
    beforeFirstTournament,
    currentSeason: currentSeason as SeasonDoc,
    firstTournament: firstTournament as TournamentDoc,
    nextTournament: nextTournament as TournamentDoc,
    seasonTournaments: seasonTournaments as EnhancedTournamentDoc[],
    member: member as MemberDoc,
    tours: tours as unknown as TourDoc[],
    seasonTourCards: seasonTourCards as TourCardDoc[],
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
