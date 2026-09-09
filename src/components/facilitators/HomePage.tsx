import { Link as RouterLink } from "@tanstack/react-router";
import {
  ArrowRight,
  CircleDollarSign,
  Shield,
  Star,
  WifiOff,
} from "lucide-react";

import {
  LeagueSchedule,
  SeasonChampions,
  TournamentCountdown,
} from "@/displays";
import { useHomePage } from "@/hooks";
import { Button, Skeleton } from "@/ui";
import type { AccountSettlementSummaryDto } from "@/types";
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
            {model.seasonHonors ? (
              <SeasonChampions
                honors={model.seasonHonors}
                seasonYear={model.currentSeason.year}
              />
            ) : null}
            <PostseasonPayoutFocus
              settlement={model.settlement}
              account={model.account}
              signedIn={Boolean(model.member)}
            />
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
            <LeagueSchedule tournaments={model.seasonTournaments} />
          </>
        )}
      </div>
    </div>
  );
}

function PostseasonPayoutFocus(props: {
  settlement: AccountSettlementSummaryDto | undefined;
  account: number | null;
  signedIn: boolean;
}) {
  if (props.signedIn && props.settlement === undefined) return null;
  if (!props.settlement?.isComplete || props.settlement.allocationCents <= 0) {
    return <AccountAlert account={props.account} />;
  }

  const status = props.settlement.request?.status;
  const needsInstructions = !status;
  const title = needsInstructions
    ? "Your postseason balance is ready"
    : status === "completed"
      ? "Your payout instructions are complete"
      : status === "in_progress"
        ? "Your payout is being processed"
        : "Your payout instructions were received";

  return (
    <section className="border-y-2 border-slate-950 py-6 text-left">
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
            <CircleDollarSign className="h-4 w-4" aria-hidden="true" />
            Postseason payout
          </p>
          <h2 className="mt-2 text-2xl font-bold">{title}</h2>
          <p className="mt-2 max-w-xl text-sm text-slate-600">
            {needsInstructions
              ? `${props.settlement.seasonLabel} winnings are included. Choose how much to receive, donate, reserve, or keep.`
              : `Review how your ${props.settlement.seasonLabel} balance was allocated.`}
          </p>
          {needsInstructions ? (
            <p className="mt-3 text-xs font-semibold text-slate-500">
              E-transfer · Charity · PGC donation · Next-season card · Keep in
              account
            </p>
          ) : null}
        </div>

        <div className="sm:min-w-56 sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {needsInstructions ? "Available balance" : "Season balance"}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums">
            {formatMoney(props.settlement.allocationCents, true)}
          </p>
          <Button asChild size="lg" className="mt-4 w-full sm:w-auto">
            <RouterLink to="/account" search={{ variant: "a" }}>
              {needsInstructions
                ? "Choose how to receive it"
                : "Review payout details"}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </RouterLink>
          </Button>
        </div>
      </div>
    </section>
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
