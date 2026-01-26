import { MoveDown, MoveHorizontal, MoveUp } from "lucide-react";

import { cn } from "@/lib";

/**
 * Renders a small icon + delta count indicating movement in standings.
 *
 * @param props.posChange - Positive means moved up, negative means moved down.
 * @returns A compact inline indicator suitable for placing next to a rank.
 */
export function StandingsPositionChange(props: { posChange: number }) {
  if (props.posChange === 0) {
    return (
      <span className="ml-1 inline-flex items-center text-xs text-muted-foreground">
        <MoveHorizontal className="h-3 w-3" />
      </span>
    );
  }

  const isPositive = props.posChange > 0;
  const Icon = isPositive ? MoveUp : MoveDown;

  return (
    <span
      className={cn(
        "ml-1 inline-flex items-center text-xs",
        isPositive ? "text-green-700" : "text-red-700",
      )}
    >
      <Icon className="h-3 w-3" />
      {Math.abs(props.posChange)}
    </span>
  );
}
