import { Link as RouterLink } from "@tanstack/react-router";
import { Shield, Star, WifiOff } from "lucide-react";

import {
  ClubhousePulse,
  LeagueSchedule,
  TournamentCountdown,
} from "@/displays";
import { useHomePage } from "@/hooks";
import { Button, Skeleton } from "@/ui";
import { formatMoney } from "@/utils/app";
import { TourCardForm } from "@/widgets";

export function HomePage() {
  const model = useHomePage();
  if (model.kind === "loading") return <HomePageSkeleton />;
  if (model.kind === "failed") {
    return (
      <div className="container mx-auto flex min-h-[50vh] items-center justify-center px-4 py-8">
        <div className="max-w-md rounded-lg border bg-white p-6 text-center shadow-sm">
          <WifiOff
            className="mx-auto h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h1 className="mt-3 text-2xl font-bold">Clubhouse unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{model.message}</p>
          <Button
            className="mt-4"
            onClick={model.retry}
            disabled={model.isRetrying}
          >
            {model.isRetrying ? "Trying again…" : "Try again"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-4 text-center">
          <h1 className="font-yellowtail text-5xl font-bold sm:text-6xl md:text-7xl">
            Welcome to the PGC Clubhouse
          </h1>
          <RoleBadge role={model.role} />
          {model.freshness === "stale" ? (
            <p role="status" className="text-xs text-amber-700">
              Showing saved information while the live connection recovers.
            </p>
          ) : (
            <span className="sr-only" role="status">
              Live data connected
            </span>
          )}
        </div>

        {model.kind === "noSeason" ? (
          <div className="rounded-lg border bg-white p-6 text-center text-slate-600">
            No season is currently available.
          </div>
        ) : (
          <>
            {model.member && model.seasonTourCards.length > 0 ? (
              <ClubhousePulse model={model.pulse} />
            ) : null}
            {model.member ? (
              <TourCardForm
                currentSeason={model.currentSeason}
                tours={model.tours}
                member={model.member}
                seasonTourCards={model.seasonTourCards}
                tournaments={model.seasonTournaments}
              />
            ) : null}
            {model.member &&
            model.seasonTourCards.length > 0 ? null : model.nextTournament ? (
              <TournamentCountdown {...model.nextTournament} />
            ) : (
              <div className="rounded-lg border bg-white p-6 text-center text-slate-600">
                This season is complete. Final results remain available in the
                standings and leaderboard.
              </div>
            )}
            <AccountAlert account={model.account} />
            <LeagueSchedule tournaments={model.seasonTournaments} />
          </>
        )}
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string | null }) {
  if (role === "admin") {
    return (
      <div className="flex items-center justify-center">
        <RouterLink
          to="/admin"
          search={{}}
          className="inline-flex min-h-11 items-center gap-1 rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Shield className="h-4 w-4" aria-hidden="true" /> Administrator
        </RouterLink>
      </div>
    );
  }
  if (role === "moderator") {
    return (
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-800">
          <Star className="h-4 w-4" aria-hidden="true" /> Moderator
        </span>
      </div>
    );
  }
  return null;
}

function AccountAlert({ account }: { account: number | null }) {
  if (account === null || account === 0) return null;
  if (account > 0) {
    return (
      <RouterLink
        to="/account"
        search={{}}
        className="block rounded-lg border bg-amber-50 p-4 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="font-medium text-amber-900">
          You have {formatMoney(account, true)} in your account.
        </div>
        <div className="mt-1 text-amber-900/80">
          Go to Account to request an e-transfer or donate.
        </div>
      </RouterLink>
    );
  }
  return (
    <div className="rounded-lg border bg-red-100 p-4 text-sm">
      <div className="font-medium text-red-900">
        You owe {formatMoney(Math.abs(account), true)} for this season.
      </div>
      <div className="mt-1 text-red-900/80">
        Send e-transfer to puregolfcollectivetour@gmail.com to unlock your
        account.
      </div>
    </div>
  );
}

function HomePageSkeleton() {
  return (
    <div
      className="container mx-auto px-4 py-8"
      aria-busy="true"
      aria-label="Loading clubhouse"
    >
      <div className="mx-auto max-w-4xl space-y-6">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}
