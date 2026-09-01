import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

import type { SeasonHonors } from "@/types";
import { Card, CardContent } from "@/ui";
import { formatScore } from "@/utils/app";
import {
  PGC_LOGO_URL,
  PLAYOFF_GOLD_LOGO_URL,
  PLAYOFF_SILVER_LOGO_URL,
} from "@/utils/constants";

export function SeasonChampions(props: {
  honors: SeasonHonors;
  seasonYear: number;
}) {
  return (
    <Card className="relative overflow-hidden border-slate-300 bg-white shadow-md">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-slate-950 via-amber-500 to-slate-950" />
      <CardContent className="p-0 pt-1">
        <section aria-labelledby="season-champion-title">
          <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50/80 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <img
                src={PGC_LOGO_URL}
                alt="PGC"
                className="h-9 w-12 shrink-0 object-contain"
                width={48}
                height={36}
              />
              <div className="min-w-0">
                <p className="truncate font-varela text-sm font-bold text-slate-950 sm:text-base">
                  PGC Championship
                </p>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">
                  {props.seasonYear} season
                </p>
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
              Official
            </span>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_5.75rem] items-center gap-3 bg-gradient-to-br from-white via-white to-amber-50/70 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_8rem] sm:gap-6 sm:px-7 sm:py-8">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
                Overall season champion
              </p>
              <h2
                id="season-champion-title"
                className="mt-1 font-varela text-xl font-black tracking-tight text-slate-950 sm:text-2xl"
              >
                PGC Champion
              </h2>
              <p className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
                {props.honors.champion.displayName}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                {props.honors.champion.score !== null ? (
                  <span className="rounded-md bg-slate-950 px-2.5 py-1 text-xs font-bold tabular-nums text-white">
                    Final {formatScore(props.honors.champion.score)}
                  </span>
                ) : null}
                <TourIdentity winner={props.honors.champion} />
              </div>
            </div>
            <img
              src={PLAYOFF_GOLD_LOGO_URL}
              alt="Gold championship trophy"
              className="h-28 w-full object-contain drop-shadow-md sm:h-36"
              width={128}
              height={144}
            />
          </div>

          {props.honors.silverChampion ? (
            <div className="flex items-center gap-3 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:px-7">
              <img
                src={PLAYOFF_SILVER_LOGO_URL}
                alt="Silver championship trophy"
                className="h-14 w-12 shrink-0 object-contain sm:h-16 sm:w-14"
                width={56}
                height={64}
              />
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Silver Champion
                </p>
                <p className="truncate text-base font-bold text-slate-900 sm:text-lg">
                  {props.honors.silverChampion.displayName}
                </p>
                <TourIdentity winner={props.honors.silverChampion} />
              </div>
              {props.honors.silverChampion.score !== null ? (
                <span className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold tabular-nums text-slate-700">
                  {formatScore(props.honors.silverChampion.score)}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="border-t border-slate-200 bg-white px-5 py-2 sm:px-7">
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

function TourIdentity(props: { winner: SeasonHonors["champion"] }) {
  if (!props.winner.tour) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-slate-500">
      {props.winner.tour.logoUrl ? (
        <img
          src={props.winner.tour.logoUrl}
          alt=""
          className="h-5 w-5 shrink-0 object-contain"
          width={20}
          height={20}
        />
      ) : null}
      <span className="truncate">{props.winner.tour.shortForm}</span>
    </span>
  );
}
