import type { LeaderboardVariant, LeaderboardViewModel } from "./utils/types";
import { LeaderboardHeaderRow } from "./components/UIComponents";
import { ToursToggle } from "./components/ToursToggle";
import { PGALeaderboard } from "./components/PGALeaderboard";
import { PGCLeaderboard } from "./components/PGCLeaderboard";

export function LeaderboardView({
  model,
  activeTourId,
  onChangeTourId,
  variant,
  isPreTournament,
}: {
  model: LeaderboardViewModel;
  activeTourId: string;
  onChangeTourId: (tourId: string) => void;
  variant: LeaderboardVariant;
  isPreTournament?: boolean;
}) {
  if (model.kind === "loading") {
    return (
      <div className="flex min-h-[400px] w-full items-center justify-center">
        <div className="mx-auto max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-lg">
          <div className="text-center">
            <div className="mb-6 flex justify-center">
              <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-600" />
            </div>
            <h2 className="mb-3 font-yellowtail text-3xl text-slate-800">
              Loading Leaderboard
            </h2>
            <p className="font-varela text-sm text-slate-600">
              Gathering the latest tournament scores and standings...
            </p>
            <div className="mt-4 flex justify-center space-x-1">
              <div className="h-2 w-2 animate-bounce rounded-full bg-slate-600 [animation-delay:-0.3s]" />
              <div className="h-2 w-2 animate-bounce rounded-full bg-slate-600 [animation-delay:-0.15s]" />
              <div className="h-2 w-2 animate-bounce rounded-full bg-slate-600" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (model.kind === "error") {
    return (
      <div className="mx-auto mt-8 w-full max-w-4xl">
        <div className="flex items-center justify-center py-12">
          <div className="text-lg font-semibold text-red-600">
            Error: {model.message}
          </div>
        </div>
      </div>
    );
  }

  const activeTourShortForm =
    model.toggleTours.find((t) => t.id === activeTourId)?.shortForm ?? "";
  const tournamentOver = (model.tournament.currentRound ?? 0) === 5;

  return (
    <div className="mx-auto mt-2 w-full max-w-4xl md:w-11/12 lg:w-8/12">
      <ToursToggle
        tours={model.toggleTours}
        activeTourId={activeTourId}
        onChangeTourId={onChangeTourId}
      />

      <LeaderboardHeaderRow
        tournamentOver={tournamentOver}
        activeTourShortForm={activeTourShortForm}
      />

      {activeTourId === "pga" ? (
        <PGALeaderboard
          golfers={model.pgaRows}
          tournament={model.tournament}
          viewer={model.viewer}
          isPreTournament={isPreTournament}
        />
      ) : (
        <PGCLeaderboard
          teams={model.pgcRows}
          tournament={model.tournament}
          allGolfers={model.pgaRows}
          viewer={model.viewer}
          activeTourId={activeTourId}
          variant={variant}
          isPreTournament={isPreTournament}
        />
      )}
    </div>
  );
}
