import { Star } from "lucide-react";

import { cn } from "@/lib";

/**
 * Toggles the standings "friends only" filter.
 *
 * @param props.pressed - Whether the filter is active.
 * @param props.disabled - Whether the toggle is currently disabled.
 * @param props.onToggle - Called when the user clicks the toggle.
 * @returns A compact star button appropriate for standings headers.
 */
export function StandingsFriendsOnlyToggle(props: {
  pressed: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onToggle}
      className={cn(
        "mx-auto flex h-6 w-6 items-center justify-center rounded-md",
        props.pressed ? "bg-slate-200" : "bg-transparent",
        props.disabled && "opacity-50",
      )}
    >
      <Star
        className={cn(
          "h-3.5 w-3.5",
          props.pressed ? "fill-slate-900 text-slate-900" : "text-slate-700",
        )}
      />
    </button>
  );
}
