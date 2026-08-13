import { Link as RouterLink } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Flag,
  Radio,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

import type {
  ClubhousePulseAction,
  ClubhousePulseCardViewModel,
  ClubhousePulseModel,
  ClubhousePulseStandingSnapshot,
  ClubhousePulseStory,
} from "@/types";
import { Button, Card, CardContent, Skeleton } from "@/ui";
import { cn } from "@/utils/classNames";

export function ClubhousePulse(props: { model: ClubhousePulseModel }) {
  if (props.model.kind === "loading") return <ClubhousePulseSkeleton />;
  if (props.model.kind !== "ready") return null;
  const model = props.model;
  const { card } = model;
  const presentation = getPhasePresentation(card.phase);
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-slate-200 bg-white shadow-lg",
        presentation.cardClassName,
      )}
      aria-label="Clubhouse Pulse"
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-1",
          presentation.accentClassName,
        )}
      />
      <CardContent className="p-4 pt-5 sm:p-6 sm:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full",
                presentation.iconContainerClassName,
              )}
            >
              <presentation.Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <span className="block font-varela text-xs font-bold uppercase tracking-[0.18em] text-slate-900">
                Clubhouse Pulse
              </span>
              <span className="block text-[11px] text-slate-500">
                Your season, right now
              </span>
            </div>
          </div>
          <div
            className="flex items-center gap-2 rounded-full border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm"
            role="status"
          >
            <span
              className={cn(
                "h-2 w-2 rounded-full bg-slate-400",
                card.isLive &&
                  model.freshness === "live" &&
                  "animate-pulse bg-emerald-500 motion-reduce:animate-none",
                model.freshness === "stale" && "bg-amber-500",
              )}
              aria-hidden="true"
            />
            {model.freshness === "stale" ? "Reconnecting" : card.statusLabel}
          </div>
        </div>

        {model.tabs.length > 1 ? (
          <div
            className="mt-4 flex gap-2 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Tour cards"
          >
            {model.tabs.map((tab) => (
              <button
                key={tab.cardId}
                type="button"
                role="tab"
                aria-selected={tab.cardId === model.selectedCardId}
                aria-label={tab.tourName}
                onClick={() => model.selectCard(tab.cardId)}
                className={cn(
                  "min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  tab.cardId === model.selectedCardId
                    ? presentation.activeTabClassName
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-5 grid gap-4 md:grid-cols-[minmax(0,1.15fr)_minmax(15rem,0.85fr)] md:items-stretch">
          <section className="min-w-0" aria-labelledby="pulse-status-heading">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              How you&apos;re doing
            </div>
            <h2
              id="pulse-status-heading"
              className="mt-1 text-3xl font-black tracking-tight text-slate-950 sm:text-4xl"
            >
              {card.headline}
            </h2>
            <div className="mt-1 font-varela text-sm font-semibold text-slate-700">
              {card.title}
            </div>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
              {card.summary}
            </p>
          </section>

          <SeasonOutlook card={card} />
        </div>

        <section className="mt-5" aria-labelledby="pulse-stats-heading">
          <h3 id="pulse-stats-heading" className="sr-only">
            At a glance
          </h3>
          <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white/90 shadow-sm">
            {card.stats.map((stat) => (
              <div
                key={stat.label}
                className="min-w-0 border-r border-slate-200 px-2 py-3 text-center last:border-r-0 sm:px-4"
                aria-label={stat.accessibleLabel}
              >
                <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:text-xs">
                  {stat.label}
                </div>
                <div className="mt-1 truncate text-base font-bold text-slate-950 sm:text-xl">
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          className={cn(
            "mt-5 rounded-xl border p-4",
            presentation.actionClassName,
          )}
          aria-labelledby="pulse-action-heading"
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                <h3
                  id="pulse-action-heading"
                  className="text-xs font-bold uppercase tracking-[0.14em]"
                >
                  What to do next
                </h3>
              </div>
              <p className="mt-1.5 text-sm leading-snug">{card.actionHint}</p>
            </div>
            <div className="flex flex-col-reverse gap-2 xs:flex-row sm:justify-end">
              {card.secondaryAction ? (
                <PulseActionLink
                  action={card.secondaryAction}
                  primary={false}
                  onClick={() =>
                    model.activateAction(card.secondaryAction!.destination)
                  }
                />
              ) : null}
              <PulseActionLink
                action={card.action}
                primary
                onClick={() => model.activateAction(card.action.destination)}
              />
            </div>
          </div>
        </section>

        {card.stories.length > 0 ? (
          <section className="mt-5" aria-labelledby="pulse-changes-heading">
            <h3
              id="pulse-changes-heading"
              className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500"
            >
              What changed
            </h3>
            <ul className="mt-2 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
              {card.stories.map((story) => (
                <li
                  key={story.kind + ":" + story.text}
                  className="flex min-w-0 items-start gap-2.5 rounded-lg border border-slate-200/80 bg-white/80 px-3 py-3"
                >
                  <StoryIcon story={story} />
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {storyLabel(story)}
                    </div>
                    <span className="mt-0.5 block leading-snug">
                      {story.text}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-4 border-t border-slate-200/80 pt-3">
          <FreshnessCopy
            isLive={card.isLive}
            timestamp={card.lastUpdatedAt}
            stale={model.freshness === "stale"}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function SeasonOutlook(props: { card: ClubhousePulseCardViewModel }) {
  const official = props.card.officialStanding;
  if (!official) {
    return (
      <div className="flex min-h-28 flex-col justify-center rounded-xl border border-white/80 bg-white/70 p-4 shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Competition
        </div>
        <div className="mt-1 text-lg font-bold text-slate-900">
          {props.card.eyebrow.split("·").at(-1)?.trim()}
        </div>
        <div className="mt-1 text-xs leading-relaxed text-slate-600">
          This Pulse is isolated to your current bracket or event.
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-white/80 bg-white/75 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          Season outlook
        </div>
        <DestinationBadge destination={official.destination} />
      </div>
      <StandingRow label="Official" standing={official} />
      {props.card.phase === "live" ? (
        props.card.projectedStanding ? (
          <StandingRow
            label="Projected"
            standing={props.card.projectedStanding}
            emphasized
          />
        ) : (
          <div className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">
            Projected · Awaiting live points
          </div>
        )
      ) : (
        <div className="mt-2 text-xs text-slate-600">
          Current path: {destinationLabel(official.destination)}
        </div>
      )}
    </div>
  );
}

function StandingRow(props: {
  label: string;
  standing: ClubhousePulseStandingSnapshot;
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-2 flex items-center justify-between gap-3 rounded-lg px-3 py-2",
        props.emphasized ? "bg-emerald-100/80" : "bg-slate-100/80",
      )}
    >
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {props.label}
        </div>
        <div className="text-lg font-black text-slate-950">
          {props.standing.position}
        </div>
      </div>
      <div className="text-right">
        <DestinationBadge destination={props.standing.destination} />
        <div className="mt-1 text-[10px] text-slate-500">
          {props.standing.points.toLocaleString()} pts
        </div>
      </div>
    </div>
  );
}

function DestinationBadge(props: {
  destination: ClubhousePulseStandingSnapshot["destination"];
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        props.destination === "gold" && "bg-amber-100 text-amber-800",
        props.destination === "silver" && "bg-slate-200 text-slate-700",
        props.destination === "out" && "bg-red-100 text-red-700",
      )}
    >
      {destinationLabel(props.destination)}
    </span>
  );
}

function PulseActionLink(props: {
  action: ClubhousePulseAction;
  primary: boolean;
  onClick: () => void;
}) {
  const content = (
    <>
      {props.action.label}
      {props.primary ? (
        <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
      ) : null}
    </>
  );
  const className = "min-h-11 w-full xs:w-auto";
  if (props.action.destination === "standings") {
    return (
      <Button
        asChild
        variant={props.primary ? "default" : "outline"}
        className={className}
      >
        <RouterLink
          to="/standings"
          search={{ tour: props.action.tourId }}
          onClick={props.onClick}
        >
          {content}
        </RouterLink>
      </Button>
    );
  }
  return (
    <Button
      asChild
      variant={props.primary ? "default" : "outline"}
      className={className}
    >
      <RouterLink
        to="/tournament"
        search={{
          tournamentId: props.action.tournamentId,
          tourId: props.action.tourId,
          variant: props.action.variant,
        }}
        onClick={props.onClick}
      >
        {content}
      </RouterLink>
    </Button>
  );
}

function StoryIcon(props: { story: ClubhousePulseStory }) {
  const className = "mt-0.5 h-4 w-4 shrink-0 text-emerald-700";
  if (props.story.kind === "movement") {
    return props.story.text.startsWith("Down") ? (
      <TrendingDown className={className} aria-hidden="true" />
    ) : (
      <TrendingUp className={className} aria-hidden="true" />
    );
  }
  if (props.story.kind === "rival") {
    return <Users className={className} aria-hidden="true" />;
  }
  if (props.story.kind === "result") {
    return <Flag className={className} aria-hidden="true" />;
  }
  return <Trophy className={className} aria-hidden="true" />;
}

function FreshnessCopy(props: {
  isLive: boolean;
  timestamp: number | null;
  stale: boolean;
}) {
  if (props.stale) {
    return (
      <span className="text-xs text-amber-700">
        Saved data stays visible while the live connection recovers.
      </span>
    );
  }
  if (!props.isLive || !props.timestamp) {
    return <span className="text-xs text-slate-500">Official league data</span>;
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500">
      <Radio className="h-3.5 w-3.5" aria-hidden="true" />
      Leaderboard updated{" "}
      {new Date(props.timestamp).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}
    </span>
  );
}

function storyLabel(story: ClubhousePulseStory) {
  if (story.kind === "movement") return "Momentum";
  if (story.kind === "rival") return "Closest rival";
  if (story.kind === "result") return "Latest result";
  return "Season outlook";
}

function destinationLabel(destination: "gold" | "silver" | "out") {
  if (destination === "gold") return "Gold";
  if (destination === "silver") return "Silver";
  return "Outside playoffs";
}

function getPhasePresentation(phase: ClubhousePulseCardViewModel["phase"]) {
  if (phase === "live") {
    return {
      Icon: Activity,
      cardClassName: "border-emerald-300/80 bg-emerald-50/50",
      accentClassName: "bg-emerald-500",
      iconContainerClassName: "bg-emerald-100 text-emerald-800",
      activeTabClassName: "border-emerald-700 bg-emerald-700 text-white",
      actionClassName: "border-emerald-200 bg-emerald-100/70 text-emerald-950",
    };
  }
  if (phase === "picks_open") {
    return {
      Icon: ClipboardCheck,
      cardClassName: "border-amber-300/80 bg-amber-50/60",
      accentClassName: "bg-amber-500",
      iconContainerClassName: "bg-amber-100 text-amber-800",
      activeTabClassName: "border-amber-700 bg-amber-700 text-white",
      actionClassName: "border-amber-200 bg-amber-100/75 text-amber-950",
    };
  }
  if (phase === "season_complete") {
    return {
      Icon: CheckCircle2,
      cardClassName: "border-violet-300/70 bg-violet-50/50",
      accentClassName: "bg-violet-500",
      iconContainerClassName: "bg-violet-100 text-violet-800",
      activeTabClassName: "border-violet-700 bg-violet-700 text-white",
      actionClassName: "border-violet-200 bg-violet-100/70 text-violet-950",
    };
  }
  return {
    Icon: CalendarClock,
    cardClassName: "border-sky-300/70 bg-sky-50/50",
    accentClassName: "bg-sky-500",
    iconContainerClassName: "bg-sky-100 text-sky-800",
    activeTabClassName: "border-sky-700 bg-sky-700 text-white",
    actionClassName: "border-sky-200 bg-sky-100/70 text-sky-950",
  };
}

export function ClubhousePulseSkeleton() {
  return (
    <Card
      className="overflow-hidden border-slate-200"
      aria-busy="true"
      aria-label="Loading Clubhouse Pulse"
    >
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex justify-between gap-4">
          <Skeleton className="h-8 w-44" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-28 w-full" />
      </CardContent>
    </Card>
  );
}
