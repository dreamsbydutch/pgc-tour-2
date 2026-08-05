import { Link as RouterLink } from "@tanstack/react-router";
import {
  Activity,
  ArrowRight,
  Flag,
  Radio,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";

import type {
  ClubhousePulseAction,
  ClubhousePulseModel,
  ClubhousePulseStory,
} from "@/types";
import { Button, Card, CardContent, Skeleton } from "@/ui";
import { cn } from "@/utils/classNames";

export function ClubhousePulse(props: { model: ClubhousePulseModel }) {
  if (props.model.kind === "loading") return <ClubhousePulseSkeleton />;
  if (props.model.kind !== "ready") return null;
  const model = props.model;
  const { card } = model;
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-slate-200 bg-white shadow-md",
        card.isLive && "border-emerald-300/80 bg-emerald-50/40",
      )}
      aria-label="Clubhouse Pulse"
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-1 bg-slate-200",
          card.isLive && "bg-emerald-500",
        )}
      />
      <CardContent className="p-4 pt-5 sm:p-6 sm:pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-700" aria-hidden="true" />
            <span className="font-varela text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">
              Clubhouse Pulse
            </span>
          </div>
          <div
            className="flex items-center gap-2 text-xs font-medium text-slate-600"
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
                    ? "border-emerald-700 bg-emerald-700 text-white"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-col gap-1">
          <p className="font-varela text-xs font-semibold uppercase tracking-wide text-slate-500">
            {card.eyebrow}
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {card.title}
          </h2>
        </div>

        <div className="mt-4 grid grid-cols-3 overflow-hidden rounded-xl border border-slate-200 bg-white/90">
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

        {card.stories.length > 0 ? (
          <ul className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
            {card.stories.map((story) => (
              <li
                key={`${story.kind}:${story.text}`}
                className="flex min-w-0 items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
              >
                <StoryIcon story={story} />
                <span className="leading-snug">{story.text}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 flex flex-col-reverse items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <FreshnessCopy
            isLive={card.isLive}
            timestamp={card.lastUpdatedAt}
            stale={model.freshness === "stale"}
          />
          <PulseActionLink
            action={card.action}
            onClick={model.activateAction}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function PulseActionLink(props: {
  action: ClubhousePulseAction;
  onClick: () => void;
}) {
  const content = (
    <>
      {props.action.label}
      <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
    </>
  );
  if (props.action.destination === "standings") {
    return (
      <Button asChild className="min-h-11 w-full sm:w-auto">
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
    <Button asChild className="min-h-11 w-full sm:w-auto">
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
  const className = "h-4 w-4 shrink-0 text-emerald-700";
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
      Updated{" "}
      {new Date(props.timestamp).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
      })}
    </span>
  );
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
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-5 w-20" />
        </div>
        <Skeleton className="h-8 w-2/3" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-11 w-full sm:ml-auto sm:w-48" />
      </CardContent>
    </Card>
  );
}
