import { Link } from "@tanstack/react-router";
import { ArrowRight, Medal, Trophy } from "lucide-react";

import type { SeasonHonors } from "@/types";
import { Card, CardContent } from "@/ui";
import { formatScore } from "@/utils/app";

export function SeasonChampions(props: {
  honors: SeasonHonors;
  seasonYear: number;
}) {
  return (
    <Card className="relative overflow-hidden border-slate-300 bg-white shadow-sm">
      <div className="absolute inset-x-0 top-0 h-1 bg-slate-950" />
      <CardContent className="p-5 pt-6 sm:p-7 sm:pt-8">
        <section aria-labelledby="season-champion-title">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-300 bg-slate-100 text-slate-900">
              <Trophy className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                {props.seasonYear} season / Official
              </p>
              <h2
                id="season-champion-title"
                className="font-varela text-xl font-black tracking-tight text-slate-950 sm:text-2xl"
              >
                PGC Champion
              </h2>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Overall season champion
              </p>
              <p className="mt-1 text-4xl font-black tracking-tight text-slate-950 sm:text-5xl">
                {props.honors.champion.displayName}
              </p>
            </div>
            {props.honors.champion.score !== null ? (
              <div className="border-t border-slate-200 pt-3 sm:border-l sm:border-t-0 sm:pb-1 sm:pl-6 sm:pt-0 sm:text-right">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Final score
                </p>
                <p className="mt-0.5 text-2xl font-black tabular-nums text-slate-950">
                  {formatScore(props.honors.champion.score)}
                </p>
              </div>
            ) : null}
          </div>

          {props.honors.silverChampion ? (
            <div className="mt-6 flex items-center gap-3 border-t border-slate-200 pt-5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                <Medal className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Silver Champion
                </p>
                <p className="truncate text-base font-bold text-slate-900 sm:text-lg">
                  {props.honors.silverChampion.displayName}
                </p>
              </div>
              {props.honors.silverChampion.score !== null ? (
                <span className="shrink-0 text-sm font-bold tabular-nums text-slate-600">
                  {formatScore(props.honors.silverChampion.score)}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-5 border-t border-slate-200 pt-4">
            <Link
              to="/tournament"
              search={{
                tournamentId: props.honors.tournamentId,
                tourId: "gold",
                variant: "playoff",
              }}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              View final playoff leaderboard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
