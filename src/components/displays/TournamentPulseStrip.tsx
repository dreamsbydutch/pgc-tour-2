import {
  ArrowDown,
  ArrowUp,
  LocateFixed,
  Minus,
  Radio,
  Users,
} from "lucide-react";

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
      className="mb-4 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50/90 p-3 shadow-sm sm:p-4"
      aria-label="Your live tournament pulse"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">
            <Radio
              className="h-4 w-4 animate-pulse motion-reduce:animate-none"
              aria-hidden="true"
            />
            Your live team
          </div>
          {props.model.seasonProjection ? (
            <div className="mt-1 text-xs font-medium text-emerald-900">
              Season: {props.model.seasonProjection}
            </div>
          ) : null}
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-10 shrink-0 border-emerald-300 bg-white"
          onClick={props.model.jumpToTeam}
        >
          <LocateFixed className="mr-2 h-4 w-4" aria-hidden="true" />
          Jump to my team
        </Button>
      </div>

      <div className="mt-3 grid grid-cols-3 divide-x divide-emerald-200 overflow-hidden rounded-lg border border-emerald-200 bg-white/85">
        <PulseStat label="Position" value={props.model.position} />
        <PulseStat label="Score" value={props.model.score} />
        <div className="min-w-0 px-2 py-2.5 text-center">
          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">
            Movement
          </div>
          <div className="mt-0.5 flex items-center justify-center gap-1 truncate text-sm font-bold text-slate-950">
            <MovementIcon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{props.model.movement}</span>
          </div>
        </div>
      </div>

      {props.model.rival ? (
        <div className="mt-2 flex items-center gap-2 text-xs text-slate-700">
          <Users className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
          <span>
            <strong>Closest rival:</strong> {props.model.rival}
          </span>
        </div>
      ) : null}
    </aside>
  );
}

function PulseStat(props: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-2 py-2.5 text-center">
      <div className="text-[9px] font-bold uppercase tracking-wide text-slate-500 sm:text-[10px]">
        {props.label}
      </div>
      <div className="mt-0.5 truncate text-sm font-black text-slate-950 sm:text-base">
        {props.value}
      </div>
    </div>
  );
}
