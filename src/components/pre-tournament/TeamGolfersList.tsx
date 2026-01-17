import { cn } from "@/lib/utils";
import type { TeamGolfersListProps, Golfer } from "./utils/types";

export function TeamGolfersList({ golfers }: TeamGolfersListProps) {
  const sortedGolfers = [...golfers]
    .sort((a, b) => (a.worldRank ?? Infinity) - (b.worldRank ?? Infinity))
    .sort((a, b) => (a.group ?? Infinity) - (b.group ?? Infinity));

  if (!golfers || golfers.length === 0) {
    return (
      <div className="mt-2 text-center text-gray-500">No team selected yet</div>
    );
  }

  return (
    <div className="mt-2">
      {sortedGolfers.map((golfer: Golfer, i) => (
        <div
          key={golfer.apiId || golfer._id || i}
          className={cn(
            i % 2 !== 0 && i < 9 && "border-b border-slate-500",
            i === 0 && "mt-2",
            "py-0.5",
          )}
        >
          <div className="text-lg">
            {golfer.worldRank && `#${golfer.worldRank} `}
            {golfer.playerName}
            {golfer.rating && ` (${golfer.rating})`}
          </div>
        </div>
      ))}
    </div>
  );
}
