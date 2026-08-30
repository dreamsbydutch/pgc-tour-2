import { Link } from "@tanstack/react-router";
import { Medal, Trophy } from "lucide-react";

import type { SeasonHonors } from "@/types";
import { formatScore } from "@/utils/app";

export function SeasonChampions(props: {
  honors: SeasonHonors;
  seasonYear: number;
}) {
  return (
    <section
      aria-labelledby="season-champion-title"
      className="relative overflow-hidden rounded-3xl border border-amber-300/70 bg-gradient-to-br from-amber-50 via-yellow-100 to-amber-200 px-5 py-7 shadow-lg sm:px-8 sm:py-9"
    >
      <div
        className="absolute -right-12 -top-16 h-44 w-44 rounded-full bg-white/35"
        aria-hidden="true"
      />
      <div className="relative text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-white shadow-md sm:h-16 sm:w-16">
          <Trophy className="h-8 w-8 sm:h-9 sm:w-9" aria-hidden="true" />
        </div>
        <p className="mt-4 text-xs font-bold uppercase tracking-[0.24em] text-amber-900/70">
          {props.seasonYear} season
        </p>
        <h2
          id="season-champion-title"
          className="mt-1 text-2xl font-black uppercase tracking-wide text-amber-950 sm:text-3xl"
        >
          PGC Champion
        </h2>
        <p className="mt-2 text-4xl font-bold text-slate-950 sm:text-5xl">
          {props.honors.champion.displayName}
        </p>
        {props.honors.champion.score !== null ? (
          <p className="mt-2 text-lg font-semibold text-amber-950/75">
            Final score {formatScore(props.honors.champion.score)}
          </p>
        ) : null}

        {props.honors.silverChampion ? (
          <div className="mx-auto mt-6 flex max-w-md items-center justify-center gap-3 rounded-2xl border border-slate-300/80 bg-white/65 px-4 py-3 text-left shadow-sm">
            <Medal
              className="h-7 w-7 shrink-0 text-slate-500"
              aria-hidden="true"
            />
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Silver Champion
              </p>
              <p className="text-lg font-bold text-slate-900">
                {props.honors.silverChampion.displayName}
                {props.honors.silverChampion.score !== null ? (
                  <span className="ml-2 font-semibold text-slate-600">
                    {formatScore(props.honors.silverChampion.score)}
                  </span>
                ) : null}
              </p>
            </div>
          </div>
        ) : null}

        <Link
          to="/tournament"
          search={{
            tournamentId: props.honors.tournamentId,
            tourId: "gold",
            variant: "playoff",
          }}
          className="mt-6 inline-flex min-h-11 items-center rounded-full border border-amber-800/30 bg-white/75 px-5 py-2 text-sm font-semibold text-amber-950 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
        >
          View final playoff leaderboard
        </Link>
      </div>
    </section>
  );
}
