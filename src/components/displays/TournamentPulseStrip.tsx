import { ArrowDown, ArrowUp, LocateFixed, Minus, Radio } from "lucide-react";

import type { TournamentPulseStripModel } from "@/types";
import { Button } from "@/ui";

export function TournamentPulseStrip(props: {
  model: TournamentPulseStripModel;
}) {
  const MovementIcon = props.model.movement.startsWith("Up")
    ? ArrowUp
    : props.model.movement.startsWith("Down")
      ? ArrowDown
      : Minus;
  return (
    <aside
      className="mb-3 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-3 shadow-sm sm:px-4"
      aria-label="Your live tournament pulse"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-emerald-800">
          <Radio
            className="h-4 w-4 animate-pulse motion-reduce:animate-none"
            aria-hidden="true"
          />
          Your pulse
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold text-slate-950">
            {props.model.position}
          </span>
          <span className="text-sm font-semibold text-slate-700">
            {props.model.score}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-700">
          <MovementIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{props.model.movement}</span>
        </span>
        {props.model.rival ? (
          <span className="text-xs text-slate-600">{props.model.rival}</span>
        ) : null}
        {props.model.seasonProjection ? (
          <span className="text-xs font-medium text-emerald-800">
            {props.model.seasonProjection}
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto min-h-10 border-emerald-300 bg-white"
          onClick={props.model.jumpToTeam}
        >
          <LocateFixed className="mr-2 h-4 w-4" aria-hidden="true" />
          Jump to my team
        </Button>
      </div>
    </aside>
  );
}
