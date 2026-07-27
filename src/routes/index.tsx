import { createFileRoute, Link as RouterLink } from "@tanstack/react-router";
import { Shield, Star } from "lucide-react";
import { api, useQuery, useViewerBootstrap } from "@/convex";
import { LeagueSchedule, TournamentCountdown } from "@/displays";
import { TourCardForm } from "@/widgets";
import { Skeleton } from "@/ui";
import { formatMoney } from "@/lib";
import type {
  EnhancedTournamentDoc,
  MemberDoc,
  SeasonDoc,
  TourCardDoc,
  TourDoc,
} from "convex/types/types";

export const Route = createFileRoute("/")({
  component: HomeRoute,
});

function HomeRoute() {
  const model = useHomePage();
  if (model.kind === "loading") return <HomePageSkeleton />;

  return (
    <div className="container mx-auto px-4 py-8 pb-20 lg:pb-8 lg:pt-20">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-4 text-center">
          <h1 className="font-yellowtail text-7xl font-bold">
            Welcome to the PGC Clubhouse
          </h1>
          {model.roleBadge}
        </div>

        {model.kind === "noSeason" ? (
          <div className="rounded-lg border bg-white p-6 text-center text-slate-600">
            No season is currently available.
          </div>
        ) : (
          <>
            {model.member ? (
              <TourCardForm
                currentSeason={model.currentSeason}
                tours={model.tours}
                member={model.member}
                seasonTourCards={model.seasonTourCards}
              />
            ) : null}
            {model.nextTournament ? (
              <TournamentCountdown {...model.nextTournament} />
            ) : (
              <div className="rounded-lg border bg-white p-6 text-center text-slate-600">
                This season is complete. Final results remain available in the
                standings and leaderboard.
              </div>
            )}
            {model.accountAlert}
            <LeagueSchedule tournaments={model.seasonTournaments} />
          </>
        )}
      </div>
    </div>
  );
}

function useHomePage():
  | { kind: "loading" }
  | {
      kind: "noSeason";
      roleBadge: React.ReactNode;
    }
  | {
      kind: "ready";
      currentSeason: SeasonDoc;
      nextTournament: EnhancedTournamentDoc | null;
      seasonTournaments: EnhancedTournamentDoc[];
      member: MemberDoc | null;
      tours: TourDoc[];
      seasonTourCards: TourCardDoc[];
      roleBadge: React.ReactNode;
      accountAlert: React.ReactNode;
    } {
  const dashboard = useQuery(api.functions.home.getPublicHomeDashboard);
  const bootstrap = useViewerBootstrap();
  if (dashboard === undefined || bootstrap === undefined)
    return { kind: "loading" };

  const member = bootstrap.member as MemberDoc | null;
  const normalizedRole = member?.role?.trim() ?? "";
  const roleBadge = normalizedRole ? (
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

  if (!dashboard.season) return { kind: "noSeason", roleBadge };

  const accountAlert =
    typeof member?.account === "number" && member.account > 0 ? (
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
    ) : typeof member?.account === "number" && member.account < 0 ? (
      <div className="block rounded-lg border bg-red-100 p-4 text-sm">
        <div className="font-medium text-amber-900">
          You owe {formatMoney(Math.abs(member.account), true)} for this season.
        </div>
        <div className="mt-1 text-amber-900/80">
          Send e-transfer to puregolfcollectivetour@gmail.com to unlock your
          account.
        </div>
      </div>
    ) : null;
  const tournaments = dashboard.tournaments as EnhancedTournamentDoc[];
  const now = Date.now();

  return {
    kind: "ready",
    currentSeason: dashboard.season as SeasonDoc,
    nextTournament:
      tournaments.find((tournament) => tournament.startDate > now) ?? null,
    seasonTournaments: tournaments,
    member,
    tours: dashboard.tours as TourDoc[],
    seasonTourCards: bootstrap.tourCards as TourCardDoc[],
    roleBadge,
    accountAlert,
  };
}

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
